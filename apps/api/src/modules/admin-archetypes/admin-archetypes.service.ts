import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pokemon-champions/database";
import {
  type ArchetypeSnapshot,
  rankCandidates,
  scoreArchetype,
  type ScoredCandidate,
} from "@pokemon-champions/scoring";
import {
  adminArchetypeDetailSchema,
  adminArchetypePopularitySchema,
  adminArchetypePreviewResponseSchema,
  adminArchetypeSummarySchema,
  archetypeDefaultLeadsSchema,
  archetypeDefaultLeadsForPickSizeSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
  calculatePokemonActualStats,
  completeArchetypeIvsSchema,
  moveTagsSchema,
  pokemonAbilitiesSchema,
  type AdminArchetypeDetail,
  type AdminArchetypePopularity,
  type AdminArchetypePopularityUpdate,
  type AdminArchetypePreviewCandidate,
  type AdminArchetypePreviewRequest,
  type AdminArchetypePreviewResponse,
  type AdminArchetypeSummary,
  type AdminArchetypeWrite,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildPreviewObservations,
  canonicalizeInput,
  canonicalizeSnapshot,
  canonicalKey,
  findExactDuplicateId,
  toPreviewCandidate,
} from "./archetype-preview";

const archetypeSummarySelect = {
  id: true,
  name: true,
  description: true,
  seasonId: true,
  ruleId: true,
  popularityTier: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.ArchetypeSelect;

const archetypeDetailSelect = {
  id: true,
  name: true,
  description: true,
  seasonId: true,
  ruleId: true,
  popularityTier: true,
  popularityScore: true,
  encounterCount: true,
  pickCount: true,
  defaultLeads: true,
  playstyleNotes: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  pokemons: {
    select: {
      slot: true,
      pokemonId: true,
      itemId: true,
      itemAlternatives: true,
      abilityId: true,
      nature: true,
      teraType: true,
      evs: true,
      statPoints: true,
      ivs: true,
      actualStats: true,
      statDataStatus: true,
      role: true,
      usageRate: true,
      threatNotes: true,
      moves: {
        select: {
          moveId: true,
          adoptionRate: true,
        },
        orderBy: [{ moveId: "asc" }],
      },
    },
    orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
  },
  sources: {
    select: {
      title: true,
      url: true,
      siteName: true,
      siteRank: true,
    },
    orderBy: [{ title: "asc" }, { url: "asc" }],
  },
} satisfies Prisma.ArchetypeSelect;

const archetypeListOrder = [
  { updatedAt: "desc" },
  { name: "asc" },
  { id: "asc" },
] satisfies Prisma.ArchetypeOrderByWithRelationInput[];

/**
 * プレビュー比較対象の Snapshot 変換に必要な列だけを取得する select。
 * N+1 を避けるため nested select で1回のクエリにまとめ、ポケモンの isMega と技タグまで含める。
 */
const archetypePreviewSelect = {
  id: true,
  name: true,
  seasonId: true,
  ruleId: true,
  popularityTier: true,
  popularityScore: true,
  encounterCount: true,
  defaultLeads: true,
  updatedAt: true,
  pokemons: {
    select: {
      slot: true,
      pokemonId: true,
      itemId: true,
      itemAlternatives: true,
      abilityId: true,
      role: true,
      usageRate: true,
      pokemon: { select: { isMega: true } },
      moves: {
        select: {
          moveId: true,
          adoptionRate: true,
          move: { select: { tags: true } },
        },
      },
    },
  },
} satisfies Prisma.ArchetypeSelect;

/**
 * プレビューの比較対象件数の安全上限。§7.1 は数十〜数百件を想定するが、
 * 異常データでも計算量が発散しないよう決定的な上限を設ける。
 */
const PREVIEW_MAX_CANDIDATES = 500;

/** プレビューで返す類似候補の表示件数(設計書 §7.3 の LIMIT 3 に準拠)。 */
const PREVIEW_CANDIDATE_LIMIT = 3;

type ArchetypeDetailRecord = Prisma.ArchetypeGetPayload<{
  select: typeof archetypeDetailSelect;
}>;

type ArchetypePreviewRecord = Prisma.ArchetypeGetPayload<{
  select: typeof archetypePreviewSelect;
}>;

interface ValidationIssue {
  path: string;
  message: string;
}

@Injectable()
export class AdminArchetypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminArchetypeSummary[]> {
    const records = await this.prisma.archetype.findMany({
      select: archetypeSummarySelect,
      orderBy: archetypeListOrder,
    });

    return records.map((record) =>
      adminArchetypeSummarySchema.parse({
        ...record,
        publishedAt: record.publishedAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }),
    );
  }

  async get(id: string): Promise<AdminArchetypeDetail> {
    const record = await this.prisma.archetype.findUnique({
      where: { id },
      select: archetypeDetailSelect,
    });
    if (!record) {
      this.throwNotFound();
    }

    return this.serializeDetail(record);
  }

  async create(input: AdminArchetypeWrite): Promise<AdminArchetypeDetail> {
    return this.translatePrismaErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        await this.validateReferences(transaction, input);
        const record = await transaction.archetype.create({
          data: this.buildCreateData(input),
          select: archetypeDetailSelect,
        });
        return this.serializeDetail(record);
      }),
    );
  }

  async update(id: string, input: AdminArchetypeWrite): Promise<AdminArchetypeDetail> {
    return this.translatePrismaErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.archetype.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          this.throwNotFound();
        }

        await this.validateReferences(transaction, input);

        // PUTは全置換。子削除・再作成を同一トランザクションに閉じ込める。
        await transaction.archetypeSource.deleteMany({ where: { archetypeId: id } });
        await transaction.archetypePokemon.deleteMany({ where: { archetypeId: id } });

        const record = await transaction.archetype.update({
          where: { id },
          data: this.buildUpdateData(input),
          select: archetypeDetailSelect,
        });
        return this.serializeDetail(record);
      }),
    );
  }

  async archive(id: string): Promise<void> {
    await this.translatePrismaErrors(async () => {
      const result = await this.prisma.archetype.updateMany({
        where: { id },
        data: { status: "archived" },
      });
      if (result.count !== 1) {
        this.throwNotFound();
      }
    });
  }

  /**
   * ARCHETYPE-003 A-02: 人気度の手動調整(PRODUCT_SPEC §8.1)。
   *
   * popularityTier は必須。popularityScore / encounterCount / pickCount は入力にある場合だけ更新し、
   * popularityScore は null で明示的にクリアできる。単一行の更新なのでトランザクションは不要。
   * 存在しない構築は Prisma P2025 経由で 404 に変換する。updatedAt は Prisma が自動更新する。
   */
  async updatePopularity(
    id: string,
    input: AdminArchetypePopularityUpdate,
  ): Promise<AdminArchetypePopularity> {
    return this.translatePrismaErrors(async () => {
      const data: Prisma.ArchetypeUpdateInput = { popularityTier: input.popularityTier };
      if (input.popularityScore !== undefined) {
        data.popularityScore = input.popularityScore;
      }
      if (input.encounterCount !== undefined) {
        data.encounterCount = input.encounterCount;
      }
      if (input.pickCount !== undefined) {
        data.pickCount = input.pickCount;
      }

      const record = await this.prisma.archetype.update({
        where: { id },
        data,
        select: {
          id: true,
          popularityTier: true,
          popularityScore: true,
          encounterCount: true,
          pickCount: true,
          updatedAt: true,
        },
      });

      return adminArchetypePopularitySchema.parse({
        ...record,
        popularityScore: record.popularityScore?.toNumber() ?? null,
        updatedAt: record.updatedAt.toISOString(),
      });
    });
  }

  /**
   * ARCHETYPE-005: 保存前構築の重複チェック・一致判定プレビュー(読み取り専用)。
   *
   * DB への create / update / delete / upsert / 書き込みトランザクションは行わない。
   * マスタ参照を検証し、入力を観測列へ変換して既存 published 構築をスコアリングする。
   * 完全重複は canonical 表現の一致で判定し、類似候補は SCORE-005 の並びで返す。
   */
  async preview(input: AdminArchetypePreviewRequest): Promise<AdminArchetypePreviewResponse> {
    // マスタ参照検証は読み取りのみ。ここではトランザクションを開かず PrismaService を渡す。
    await this.validateReferences(this.prisma, input);

    const inputPokemonRecords = await this.prisma.pokemon.findMany({
      where: { id: { in: input.pokemons.map((pokemon) => pokemon.pokemonId) } },
      select: { id: true, isMega: true },
    });
    const isMegaByPokemonId = new Map(
      inputPokemonRecords.map((pokemon) => [pokemon.id, pokemon.isMega]),
    );

    const observations = buildPreviewObservations(input, isMegaByPokemonId);
    const inputKey = canonicalKey(canonicalizeInput(input, isMegaByPokemonId));

    // 比較対象は現行 season+rule の published のみ(§7.1 / §13.2 archived は対象外)。
    const records = await this.prisma.archetype.findMany({
      where: { seasonId: input.seasonId, ruleId: input.ruleId, status: "published" },
      select: archetypePreviewSelect,
      orderBy: [{ id: "asc" }],
      take: PREVIEW_MAX_CANDIDATES,
    });

    const snapshotById = new Map<string, ArchetypeSnapshot>();
    const scored: ScoredCandidate[] = [];
    const existingKeys: { archetypeId: string; canonicalKey: string }[] = [];

    for (const record of records) {
      const snapshot = this.toPreviewSnapshot(record);
      snapshotById.set(snapshot.id, snapshot);
      scored.push(scoreArchetype(snapshot, observations));
      existingKeys.push({
        archetypeId: record.id,
        canonicalKey: canonicalKey(canonicalizeSnapshot(snapshot, record.seasonId, record.ruleId)),
      });
    }

    const exactDuplicateArchetypeId = findExactDuplicateId(inputKey, existingKeys);
    const ranked = rankCandidates(scored, snapshotById, PREVIEW_CANDIDATE_LIMIT);
    const candidates: AdminArchetypePreviewCandidate[] = ranked.map((candidate) => {
      const snapshot = snapshotById.get(candidate.archetypeId);
      if (snapshot === undefined) {
        this.throwMasterIntegrityError();
      }
      return toPreviewCandidate(candidate, snapshot);
    });

    return adminArchetypePreviewResponseSchema.parse({
      exactDuplicate: exactDuplicateArchetypeId !== null,
      exactDuplicateArchetypeId,
      candidates,
    });
  }

  private toPreviewSnapshot(record: ArchetypePreviewRecord): ArchetypeSnapshot {
    return {
      id: record.id,
      name: record.name,
      popularityTier: archetypePopularityTierSchema.parse(record.popularityTier),
      popularityScore: record.popularityScore?.toNumber() ?? null,
      encounterCount: record.encounterCount,
      defaultLeadSlots: archetypeDefaultLeadsSchema.parse(record.defaultLeads),
      updatedAt: record.updatedAt.toISOString(),
      pokemons: record.pokemons.map((pokemon) => ({
        slot: pokemon.slot,
        pokemonId: pokemon.pokemonId,
        itemId: pokemon.itemId ?? undefined,
        itemAlternativeIds: archetypeItemAlternativeIdsSchema.parse(pokemon.itemAlternatives),
        abilityId: pokemon.abilityId ?? undefined,
        role: archetypePokemonRoleSchema.parse(pokemon.role),
        usageRate: pokemon.usageRate.toNumber(),
        isMega: pokemon.pokemon.isMega,
        moves: pokemon.moves.map((move) => ({
          moveId: move.moveId,
          adoptionRate: move.adoptionRate.toNumber(),
          tags: moveTagsSchema.parse(move.move.tags),
        })),
      })),
    };
  }

  private buildCreateData(input: AdminArchetypeWrite): Prisma.ArchetypeCreateInput {
    return {
      name: input.name,
      description: input.description,
      season: { connect: { id: input.seasonId } },
      rule: { connect: { id: input.ruleId } },
      defaultLeads: input.defaultLeads,
      playstyleNotes: input.playstyleNotes,
      status: input.status,
      pokemons: { create: this.buildPokemonCreateData(input) },
      sources: { create: input.sources },
    };
  }

  private buildUpdateData(input: AdminArchetypeWrite): Prisma.ArchetypeUpdateInput {
    return {
      name: input.name,
      description: input.description,
      season: { connect: { id: input.seasonId } },
      rule: { connect: { id: input.ruleId } },
      defaultLeads: input.defaultLeads,
      playstyleNotes: input.playstyleNotes,
      status: input.status,
      pokemons: { create: this.buildPokemonCreateData(input) },
      sources: { create: input.sources },
    };
  }

  private buildPokemonCreateData(
    input: AdminArchetypeWrite,
  ): Prisma.ArchetypePokemonCreateWithoutArchetypeInput[] {
    return input.pokemons.map((pokemon) => ({
      slot: pokemon.slot,
      pokemon: { connect: { id: pokemon.pokemonId } },
      item:
        pokemon.itemId === null
          ? undefined
          : {
              connect: { id: pokemon.itemId },
            },
      itemAlternatives: pokemon.itemAlternatives,
      ability:
        pokemon.abilityId === null
          ? undefined
          : {
              connect: { id: pokemon.abilityId },
            },
      nature: pokemon.nature,
      teraType: pokemon.teraType,
      evs: pokemon.evs === null ? Prisma.DbNull : pokemon.evs,
      statPoints: pokemon.statPoints === null ? Prisma.DbNull : pokemon.statPoints,
      ivs: pokemon.ivs === null ? Prisma.DbNull : pokemon.ivs,
      actualStats: pokemon.actualStats === null ? Prisma.DbNull : pokemon.actualStats,
      statDataStatus: pokemon.statDataStatus,
      role: pokemon.role,
      usageRate: pokemon.usageRate,
      threatNotes: pokemon.threatNotes,
      moves: {
        create: pokemon.moves.map((move) => ({
          move: { connect: { id: move.moveId } },
          adoptionRate: move.adoptionRate,
        })),
      },
    }));
  }

  private async validateReferences(
    transaction: Prisma.TransactionClient,
    input: AdminArchetypeWrite,
  ): Promise<void> {
    const pokemonIds = input.pokemons.map((pokemon) => pokemon.pokemonId);
    const itemIds = [
      ...new Set(
        input.pokemons.flatMap((pokemon) => [
          ...(pokemon.itemId === null ? [] : [pokemon.itemId]),
          ...pokemon.itemAlternatives,
        ]),
      ),
    ];
    const abilityIds = [
      ...new Set(
        input.pokemons.flatMap((pokemon) =>
          pokemon.abilityId === null ? [] : [pokemon.abilityId],
        ),
      ),
    ];
    const moveIds = [
      ...new Set(input.pokemons.flatMap((pokemon) => pokemon.moves.map((move) => move.moveId))),
    ];
    const learnabilityPairs = input.pokemons.flatMap((pokemon) =>
      pokemon.moves.map((move) => ({
        pokemonId: pokemon.pokemonId,
        moveId: move.moveId,
      })),
    );

    const [season, rule, pokemons, items, abilities, moves, pokemonMoves] = await Promise.all([
      transaction.season.findUnique({
        where: { id: input.seasonId },
        select: { id: true },
      }),
      transaction.rule.findUnique({
        where: { id: input.ruleId },
        select: { id: true, teamSize: true, pickSize: true, battleLevel: true },
      }),
      transaction.pokemon.findMany({
        where: { id: { in: pokemonIds } },
        select: {
          id: true,
          abilities: true,
          baseHp: true,
          baseAtk: true,
          baseDef: true,
          baseSpa: true,
          baseSpd: true,
          baseSpe: true,
        },
      }),
      transaction.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true },
      }),
      transaction.ability.findMany({
        where: { id: { in: abilityIds } },
        select: { id: true, nameJa: true },
      }),
      transaction.move.findMany({
        where: { id: { in: moveIds } },
        select: { id: true },
      }),
      transaction.pokemonMove.findMany({
        where: { OR: learnabilityPairs },
        select: { pokemonId: true, moveId: true },
      }),
    ]);

    const issues: ValidationIssue[] = [];
    if (!season) {
      issues.push({ path: "seasonId", message: "指定されたシーズンは存在しません" });
    }
    if (!rule) {
      issues.push({ path: "ruleId", message: "指定されたルールは存在しません" });
    } else {
      if (input.pokemons.length !== rule.teamSize) {
        issues.push({
          path: "pokemons",
          message: `採用ポケモン数はルールのteamSize（${rule.teamSize}）と一致させてください`,
        });
      }
      if (
        !archetypeDefaultLeadsForPickSizeSchema(rule.pickSize).safeParse(input.defaultLeads).success
      ) {
        issues.push({
          path: "defaultLeads",
          message: `基本選出数は0件またはルールのpickSize（${rule.pickSize}）件にしてください`,
        });
      }
    }

    const pokemonById = new Map(pokemons.map((pokemon) => [pokemon.id, pokemon]));
    const itemIdSet = new Set(items.map((item) => item.id));
    const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));
    const moveIdSet = new Set(moves.map((move) => move.id));
    const pokemonMoveSet = new Set(
      pokemonMoves.map((pokemonMove) => `${pokemonMove.pokemonId}:${pokemonMove.moveId}`),
    );

    for (const [pokemonIndex, pokemonInput] of input.pokemons.entries()) {
      const pokemon = pokemonById.get(pokemonInput.pokemonId);
      if (!pokemon) {
        issues.push({
          path: `pokemons.${pokemonIndex}.pokemonId`,
          message: "指定されたポケモンは存在しません",
        });
      }

      if (pokemonInput.itemId !== null && !itemIdSet.has(pokemonInput.itemId)) {
        issues.push({
          path: `pokemons.${pokemonIndex}.itemId`,
          message: `指定された持ち物（ID: ${pokemonInput.itemId}）は存在しません`,
        });
      }
      for (const [alternativeIndex, itemId] of pokemonInput.itemAlternatives.entries()) {
        if (!itemIdSet.has(itemId)) {
          issues.push({
            path: `pokemons.${pokemonIndex}.itemAlternatives.${alternativeIndex}`,
            message: `指定された持ち物（ID: ${itemId}）は存在しません`,
          });
        }
      }

      if (pokemonInput.abilityId !== null) {
        const ability = abilityById.get(pokemonInput.abilityId);
        if (!ability) {
          issues.push({
            path: `pokemons.${pokemonIndex}.abilityId`,
            message: "指定された特性は存在しません",
          });
        } else if (pokemon) {
          const possibleAbilities = pokemonAbilitiesSchema.safeParse(pokemon.abilities);
          if (!possibleAbilities.success) {
            this.throwMasterIntegrityError();
          }
          if (!possibleAbilities.data.includes(ability.nameJa)) {
            issues.push({
              path: `pokemons.${pokemonIndex}.abilityId`,
              message: "指定されたポケモンが持てない特性です",
            });
          }
        }
      }

      if (
        pokemonInput.statDataStatus === "derived" &&
        pokemon &&
        rule &&
        pokemonInput.actualStats !== null &&
        pokemonInput.evs !== null &&
        pokemonInput.nature !== null
      ) {
        const ivs = completeArchetypeIvsSchema.safeParse(pokemonInput.ivs);
        if (!ivs.success) {
          this.throwMasterIntegrityError();
        }
        let calculated;
        try {
          calculated = calculatePokemonActualStats({
            baseStats: {
              hp: pokemon.baseHp,
              attack: pokemon.baseAtk,
              defense: pokemon.baseDef,
              specialAttack: pokemon.baseSpa,
              specialDefense: pokemon.baseSpd,
              speed: pokemon.baseSpe,
            },
            evs: pokemonInput.evs,
            ivs: ivs.data,
            level: rule.battleLevel,
            nature: pokemonInput.nature,
          });
        } catch {
          issues.push({
            path: `pokemons.${pokemonIndex}.nature`,
            message: "derivedの実数値を算出できない性格または能力値です",
          });
          calculated = null;
        }
        if (
          calculated !== null &&
          Object.entries(calculated).some(
            ([key, value]) => pokemonInput.actualStats?.[key as keyof typeof calculated] !== value,
          )
        ) {
          issues.push({
            path: `pokemons.${pokemonIndex}.actualStats`,
            message:
              "actualStatsが明示されたIV・EV・性格・Rule.battleLevelの算出結果と一致しません",
          });
        }
      }

      for (const [moveIndex, moveInput] of pokemonInput.moves.entries()) {
        if (!moveIdSet.has(moveInput.moveId)) {
          issues.push({
            path: `pokemons.${pokemonIndex}.moves.${moveIndex}.moveId`,
            message: "指定された技は存在しません",
          });
        } else if (
          pokemon &&
          !pokemonMoveSet.has(`${pokemonInput.pokemonId}:${moveInput.moveId}`)
        ) {
          issues.push({
            path: `pokemons.${pokemonIndex}.moves.${moveIndex}.moveId`,
            message: "指定されたポケモンが習得できない技です",
          });
        }
      }
    }

    if (issues.length > 0) {
      this.throwInvalidMasterReference(issues);
    }
  }

  private serializeDetail(record: ArchetypeDetailRecord): AdminArchetypeDetail {
    return adminArchetypeDetailSchema.parse({
      ...record,
      popularityScore: record.popularityScore?.toNumber() ?? null,
      publishedAt: record.publishedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      pokemons: record.pokemons.map((pokemon) => ({
        ...pokemon,
        usageRate: pokemon.usageRate.toNumber(),
        moves: pokemon.moves.map((move) => ({
          ...move,
          adoptionRate: move.adoptionRate.toNumber(),
        })),
      })),
    });
  }

  private async translatePrismaErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          this.throwConflict();
        }
        if (error.code === "P2003") {
          this.throwInvalidMasterReference([
            { path: "masterId", message: "参照先マスタが存在しません" },
          ]);
        }
        if (error.code === "P2025") {
          this.throwNotFound();
        }
        if (error.code === "P2004") {
          this.throwValidationError();
        }
      }
      throw error;
    }
  }

  private throwNotFound(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Archetype Not Found",
      status: 404,
      code: "NOT_FOUND",
    };
    throw new NotFoundException(problem);
  }

  private throwInvalidMasterReference(errors: ValidationIssue[]): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Master Reference",
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
      errors,
    };
    throw new BadRequestException(problem);
  }

  private throwConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Archetype Conflict",
      status: 409,
      code: "ARCHETYPE_CONFLICT",
    };
    throw new ConflictException(problem);
  }

  private throwValidationError(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Validation Failed",
      status: 400,
      code: "VALIDATION_ERROR",
    };
    throw new BadRequestException(problem);
  }

  private throwMasterIntegrityError(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Master Data Integrity Error",
      status: 500,
      code: "INTERNAL_ERROR",
    };
    throw new InternalServerErrorException(problem);
  }
}
