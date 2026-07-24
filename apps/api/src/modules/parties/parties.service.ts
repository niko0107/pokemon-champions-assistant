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
  partyDetailSchema,
  partySummarySchema,
  pokemonAbilitiesSchema,
  type PartyDetail,
  type PartySummary,
  type PartyWrite,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const partySummarySelect = {
  id: true,
  name: true,
  description: true,
  ruleId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PartySelect;

const partyDetailSelect = {
  ...partySummarySelect,
  pokemons: {
    select: {
      slot: true,
      pokemonId: true,
      itemId: true,
      abilityId: true,
      nature: true,
      teraType: true,
      evs: true,
      ivs: true,
      actualStats: true,
      moves: {
        select: {
          slot: true,
          moveId: true,
        },
        orderBy: [{ slot: "asc" }, { moveId: "asc" }],
      },
    },
    orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
  },
} satisfies Prisma.PartySelect;

const partyListOrder = [
  { isActive: "desc" },
  { updatedAt: "desc" },
  { name: "asc" },
  { id: "asc" },
] satisfies Prisma.PartyOrderByWithRelationInput[];

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

type PartyDetailRecord = Prisma.PartyGetPayload<{ select: typeof partyDetailSelect }>;

interface ValidationIssue {
  path: string;
  message: string;
}

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<PartySummary[]> {
    const records = await this.prisma.party.findMany({
      where: { userId },
      select: partySummarySelect,
      orderBy: partyListOrder,
    });

    return records.map((record) =>
      partySummarySchema.parse({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }),
    );
  }

  async get(userId: string, id: string): Promise<PartyDetail> {
    const record = await this.prisma.party.findFirst({
      where: { id, userId },
      select: partyDetailSelect,
    });
    if (!record) {
      this.throwNotFound();
    }

    return this.serializeDetail(record);
  }

  async create(userId: string, input: PartyWrite): Promise<PartyDetail> {
    return this.translatePrismaErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        await this.validateReferences(transaction, input);

        if (input.isActive) {
          await this.deactivateExistingParty(transaction, userId);
        }

        const record = await transaction.party.create({
          data: this.buildCreateData(userId, input),
          select: partyDetailSelect,
        });
        return this.serializeDetail(record);
      }, transactionOptions),
    );
  }

  async update(userId: string, id: string, input: PartyWrite): Promise<PartyDetail> {
    return this.translatePrismaErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.party.findFirst({
          where: { id, userId },
          select: { id: true },
        });
        if (!existing) {
          this.throwNotFound();
        }

        await this.validateReferences(transaction, input);

        if (input.isActive) {
          await this.deactivateExistingParty(transaction, userId, id);
        }

        // PUTは全置換。所有者確認済みの親に属する子だけを削除し、同一transactionで再作成する。
        await transaction.partyPokemon.deleteMany({
          where: {
            partyId: id,
            party: { userId },
          },
        });

        const record = await transaction.party.update({
          where: { id, userId },
          data: this.buildUpdateData(input),
          select: partyDetailSelect,
        });
        return this.serializeDetail(record);
      }, transactionOptions),
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.translatePrismaErrors(async () => {
      const result = await this.prisma.party.deleteMany({
        where: { id, userId },
      });
      if (result.count !== 1) {
        this.throwNotFound();
      }
    });
  }

  private buildCreateData(userId: string, input: PartyWrite): Prisma.PartyCreateInput {
    return {
      user: { connect: { id: userId } },
      name: input.name,
      description: input.description,
      rule: { connect: { id: input.ruleId } },
      isActive: input.isActive,
      pokemons: { create: this.buildPokemonCreateData(input) },
    };
  }

  private buildUpdateData(input: PartyWrite): Prisma.PartyUpdateInput {
    return {
      name: input.name,
      description: input.description,
      rule: { connect: { id: input.ruleId } },
      isActive: input.isActive,
      pokemons: { create: this.buildPokemonCreateData(input) },
    };
  }

  private buildPokemonCreateData(input: PartyWrite): Prisma.PartyPokemonCreateWithoutPartyInput[] {
    return input.pokemons.map((pokemon) => ({
      slot: pokemon.slot,
      pokemon: { connect: { id: pokemon.pokemonId } },
      item: pokemon.itemId === null ? undefined : { connect: { id: pokemon.itemId } },
      ability: pokemon.abilityId === null ? undefined : { connect: { id: pokemon.abilityId } },
      nature: pokemon.nature,
      teraType: pokemon.teraType,
      evs: pokemon.evs,
      ivs: pokemon.ivs === null ? Prisma.DbNull : pokemon.ivs,
      actualStats: pokemon.actualStats === null ? Prisma.DbNull : pokemon.actualStats,
      moves: {
        create: pokemon.moves.map((move) => ({
          slot: move.slot,
          move: { connect: { id: move.moveId } },
        })),
      },
    }));
  }

  private async deactivateExistingParty(
    transaction: Prisma.TransactionClient,
    userId: string,
    excludedId?: string,
  ): Promise<void> {
    await transaction.party.updateMany({
      where: {
        userId,
        isActive: true,
        ...(excludedId === undefined ? {} : { id: { not: excludedId } }),
      },
      data: { isActive: false },
    });
  }

  private async validateReferences(
    transaction: Prisma.TransactionClient,
    input: PartyWrite,
  ): Promise<void> {
    const pokemonIds = input.pokemons.map((pokemon) => pokemon.pokemonId);
    const itemIds = [
      ...new Set(
        input.pokemons.flatMap((pokemon) => (pokemon.itemId === null ? [] : [pokemon.itemId])),
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

    const [rule, pokemons, items, abilities, moves, pokemonMoves] = await Promise.all([
      transaction.rule.findUnique({
        where: { id: input.ruleId },
        select: { id: true, teamSize: true },
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
    if (!rule) {
      issues.push({ path: "ruleId", message: "指定されたルールは存在しません" });
    } else {
      if (input.pokemons.length !== rule.teamSize) {
        issues.push({
          path: "pokemons",
          message: `パーティ人数はルールのteamSize（${rule.teamSize}）と一致させてください`,
        });
      }
      input.pokemons.forEach((pokemon, pokemonIndex) => {
        if (pokemon.slot > rule.teamSize) {
          issues.push({
            path: `pokemons.${pokemonIndex}.slot`,
            message: `slotはルールのteamSize（${rule.teamSize}）以下にしてください`,
          });
        }
      });
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
          message: "指定された持ち物は存在しません",
        });
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

  private serializeDetail(record: PartyDetailRecord): PartyDetail {
    return partyDetailSchema.parse({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
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
        if (error.code === "P2002" || error.code === "P2034") {
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
      title: "Party Not Found",
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
      title: "Party Conflict",
      status: 409,
      code: "PARTY_CONFLICT",
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
