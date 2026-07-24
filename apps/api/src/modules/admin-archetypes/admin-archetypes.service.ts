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
  adminArchetypeDetailSchema,
  adminArchetypeSummarySchema,
  pokemonAbilitiesSchema,
  type AdminArchetypeDetail,
  type AdminArchetypeSummary,
  type AdminArchetypeWrite,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

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

type ArchetypeDetailRecord = Prisma.ArchetypeGetPayload<{
  select: typeof archetypeDetailSelect;
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
        select: { id: true, teamSize: true, pickSize: true },
      }),
      transaction.pokemon.findMany({
        where: { id: { in: pokemonIds } },
        select: { id: true, abilities: true },
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
      if (input.defaultLeads.length !== rule.pickSize) {
        issues.push({
          path: "defaultLeads",
          message: `基本選出数はルールのpickSize（${rule.pickSize}）と一致させてください`,
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
