import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pokemon-champions/database";
import {
  adminAbilitySchema,
  adminItemSchema,
  adminMoveSchema,
  adminPokemonMovesResponseSchema,
  adminPokemonSchema,
  pokemonAbilitiesSchema,
  type AdminAbility,
  type AdminAbilityWrite,
  type AdminItem,
  type AdminItemWrite,
  type AdminMove,
  type AdminMoveWrite,
  type AdminPokemon,
  type AdminPokemonMovesResponse,
  type AdminPokemonMovesWrite,
  type AdminPokemonWrite,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const pokemonSelect = {
  id: true,
  dexNo: true,
  nameJa: true,
  nameEn: true,
  form: true,
  type1: true,
  type2: true,
  baseHp: true,
  baseAtk: true,
  baseDef: true,
  baseSpa: true,
  baseSpd: true,
  baseSpe: true,
  abilities: true,
  isMega: true,
  basePokemonId: true,
} satisfies Prisma.PokemonSelect;

const moveSelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  type: true,
  category: true,
  power: true,
  accuracy: true,
  priority: true,
  tags: true,
} satisfies Prisma.MoveSelect;

const itemSelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  effectTags: true,
} satisfies Prisma.ItemSelect;

const abilitySelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  effectTags: true,
} satisfies Prisma.AbilitySelect;

type PokemonRecord = Prisma.PokemonGetPayload<{ select: typeof pokemonSelect }>;
type MoveRecord = Prisma.MoveGetPayload<{ select: typeof moveSelect }>;
type ItemRecord = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;
type AbilityRecord = Prisma.AbilityGetPayload<{ select: typeof abilitySelect }>;

type MasterKind = "Pokemon" | "Move" | "Item" | "Ability";

/**
 * MASTER-008: game masterのadmin専用CRUD。
 * 公開master APIとはselect・契約を共有せず、書き込み境界をこのServiceへ閉じ込める。
 */
@Injectable()
export class AdminMasterService {
  constructor(private readonly prisma: PrismaService) {}

  async listPokemons(): Promise<AdminPokemon[]> {
    const records = await this.prisma.pokemon.findMany({
      select: pokemonSelect,
      orderBy: [{ dexNo: "asc" }, { form: "asc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializePokemon(record));
  }

  async getPokemon(id: number): Promise<AdminPokemon> {
    const record = await this.prisma.pokemon.findUnique({
      where: { id },
      select: pokemonSelect,
    });
    if (!record) {
      this.throwNotFound("Pokemon");
    }
    return this.serializePokemon(record);
  }

  async createPokemon(input: AdminPokemonWrite): Promise<AdminPokemon> {
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        await this.validatePokemonWrite(transaction, null, input);
        return transaction.pokemon.create({
          data: input,
          select: pokemonSelect,
        });
      });
      return this.serializePokemon(record);
    } catch (error: unknown) {
      this.translateWriteError(error, "Pokemon");
    }
  }

  async updatePokemon(id: number, input: AdminPokemonWrite): Promise<AdminPokemon> {
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.pokemon.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          this.throwNotFound("Pokemon");
        }
        await this.validatePokemonWrite(transaction, id, input);
        return transaction.pokemon.update({
          where: { id },
          data: input,
          select: pokemonSelect,
        });
      });
      return this.serializePokemon(record);
    } catch (error: unknown) {
      this.translateWriteError(error, "Pokemon");
    }
  }

  async deletePokemon(id: number): Promise<void> {
    await this.deleteMaster("Pokemon", () => this.prisma.pokemon.delete({ where: { id } }));
  }

  async listMoves(): Promise<AdminMove[]> {
    const records = await this.prisma.move.findMany({
      select: moveSelect,
      orderBy: [{ nameJa: "asc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializeMove(record));
  }

  async getMove(id: number): Promise<AdminMove> {
    const record = await this.prisma.move.findUnique({ where: { id }, select: moveSelect });
    if (!record) {
      this.throwNotFound("Move");
    }
    return this.serializeMove(record);
  }

  async createMove(input: AdminMoveWrite): Promise<AdminMove> {
    try {
      return this.serializeMove(await this.prisma.move.create({ data: input, select: moveSelect }));
    } catch (error: unknown) {
      this.translateWriteError(error, "Move");
    }
  }

  async updateMove(id: number, input: AdminMoveWrite): Promise<AdminMove> {
    await this.ensureExists(
      "Move",
      id,
      this.prisma.move.findUnique({ where: { id }, select: { id: true } }),
    );
    try {
      return this.serializeMove(
        await this.prisma.move.update({ where: { id }, data: input, select: moveSelect }),
      );
    } catch (error: unknown) {
      this.translateWriteError(error, "Move");
    }
  }

  async deleteMove(id: number): Promise<void> {
    await this.deleteMaster("Move", () => this.prisma.move.delete({ where: { id } }));
  }

  async listItems(): Promise<AdminItem[]> {
    const records = await this.prisma.item.findMany({
      select: itemSelect,
      orderBy: [{ nameJa: "asc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializeItem(record));
  }

  async getItem(id: number): Promise<AdminItem> {
    const record = await this.prisma.item.findUnique({ where: { id }, select: itemSelect });
    if (!record) {
      this.throwNotFound("Item");
    }
    return this.serializeItem(record);
  }

  async createItem(input: AdminItemWrite): Promise<AdminItem> {
    try {
      return this.serializeItem(await this.prisma.item.create({ data: input, select: itemSelect }));
    } catch (error: unknown) {
      this.translateWriteError(error, "Item");
    }
  }

  async updateItem(id: number, input: AdminItemWrite): Promise<AdminItem> {
    await this.ensureExists(
      "Item",
      id,
      this.prisma.item.findUnique({ where: { id }, select: { id: true } }),
    );
    try {
      return this.serializeItem(
        await this.prisma.item.update({ where: { id }, data: input, select: itemSelect }),
      );
    } catch (error: unknown) {
      this.translateWriteError(error, "Item");
    }
  }

  async deleteItem(id: number): Promise<void> {
    await this.deleteMaster("Item", () => this.prisma.item.delete({ where: { id } }));
  }

  async listAbilities(): Promise<AdminAbility[]> {
    const records = await this.prisma.ability.findMany({
      select: abilitySelect,
      orderBy: [{ nameJa: "asc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializeAbility(record));
  }

  async getAbility(id: number): Promise<AdminAbility> {
    const record = await this.prisma.ability.findUnique({ where: { id }, select: abilitySelect });
    if (!record) {
      this.throwNotFound("Ability");
    }
    return this.serializeAbility(record);
  }

  async createAbility(input: AdminAbilityWrite): Promise<AdminAbility> {
    try {
      return this.serializeAbility(
        await this.prisma.ability.create({ data: input, select: abilitySelect }),
      );
    } catch (error: unknown) {
      this.translateWriteError(error, "Ability");
    }
  }

  async updateAbility(id: number, input: AdminAbilityWrite): Promise<AdminAbility> {
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.ability.findUnique({
          where: { id },
          select: { id: true, nameJa: true },
        });
        if (!existing) {
          this.throwNotFound("Ability");
        }

        if (existing.nameJa !== input.nameJa) {
          const pokemons = await transaction.pokemon.findMany({
            where: { abilities: { array_contains: [existing.nameJa] } },
            select: { id: true, abilities: true },
          });
          for (const pokemon of pokemons) {
            const abilities = pokemonAbilitiesSchema
              .parse(pokemon.abilities)
              .map((name) => (name === existing.nameJa ? input.nameJa : name));
            await transaction.pokemon.update({
              where: { id: pokemon.id },
              data: { abilities: pokemonAbilitiesSchema.parse(abilities) },
            });
          }
        }

        return transaction.ability.update({
          where: { id },
          data: input,
          select: abilitySelect,
        });
      });
      return this.serializeAbility(record);
    } catch (error: unknown) {
      this.translateWriteError(error, "Ability");
    }
  }

  async deleteAbility(id: number): Promise<void> {
    const ability = await this.prisma.ability.findUnique({
      where: { id },
      select: { id: true, nameJa: true },
    });
    if (!ability) {
      this.throwNotFound("Ability");
    }
    const pokemonReference = await this.prisma.pokemon.findFirst({
      where: { abilities: { array_contains: [ability.nameJa] } },
      select: { id: true },
    });
    if (pokemonReference) {
      this.throwConflict();
    }
    await this.deleteMaster("Ability", () => this.prisma.ability.delete({ where: { id } }));
  }

  async listPokemonMoves(pokemonId: number): Promise<AdminPokemonMovesResponse> {
    await this.ensureExists(
      "Pokemon",
      pokemonId,
      this.prisma.pokemon.findUnique({ where: { id: pokemonId }, select: { id: true } }),
    );
    const records = await this.prisma.pokemonMove.findMany({
      where: { pokemonId },
      select: { moveId: true },
      orderBy: { moveId: "asc" },
    });
    return adminPokemonMovesResponseSchema.parse({
      pokemonId,
      moveIds: records.map((record) => record.moveId),
    });
  }

  async replacePokemonMoves(
    pokemonId: number,
    input: AdminPokemonMovesWrite,
  ): Promise<AdminPokemonMovesResponse> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const pokemon = await transaction.pokemon.findUnique({
          where: { id: pokemonId },
          select: { id: true },
        });
        if (!pokemon) {
          this.throwNotFound("Pokemon");
        }

        const moves = await transaction.move.findMany({
          where: { id: { in: input.moveIds } },
          select: { id: true },
        });
        if (moves.length !== input.moveIds.length) {
          this.throwInvalidReference("moveIds", "存在しない技が含まれています");
        }

        const current = await transaction.pokemonMove.findMany({
          where: { pokemonId },
          select: { moveId: true },
        });
        const nextIds = new Set(input.moveIds);
        const removedIds = current
          .map((entry) => entry.moveId)
          .filter((moveId) => !nextIds.has(moveId));
        await this.ensureRemovedPokemonMovesAreUnused(transaction, pokemonId, removedIds);

        await transaction.pokemonMove.deleteMany({ where: { pokemonId } });
        if (input.moveIds.length > 0) {
          await transaction.pokemonMove.createMany({
            data: input.moveIds.map((moveId) => ({ pokemonId, moveId })),
          });
        }

        return adminPokemonMovesResponseSchema.parse({
          pokemonId,
          moveIds: [...input.moveIds].sort((left, right) => left - right),
        });
      });
    } catch (error: unknown) {
      this.translateWriteError(error, "Pokemon");
    }
  }

  private async validatePokemonWrite(
    transaction: Prisma.TransactionClient,
    pokemonId: number | null,
    input: AdminPokemonWrite,
  ): Promise<void> {
    if (pokemonId !== null && input.basePokemonId === pokemonId) {
      this.throwInvalidReference("basePokemonId", "自分自身は元ポケモンに指定できません");
    }

    const abilityRecords = await transaction.ability.findMany({
      where: { nameJa: { in: input.abilities } },
      select: { nameJa: true },
    });
    if (
      abilityRecords.length !== input.abilities.length ||
      abilityRecords.some((ability) => !input.abilities.includes(ability.nameJa))
    ) {
      this.throwInvalidReference("abilities", "存在しない特性が含まれています");
    }

    if (pokemonId !== null) {
      const existing = await transaction.pokemon.findUnique({
        where: { id: pokemonId },
        select: { abilities: true },
      });
      if (!existing) {
        this.throwNotFound("Pokemon");
      }
      const nextAbilities = new Set(input.abilities);
      const removedNames = pokemonAbilitiesSchema
        .parse(existing.abilities)
        .filter((name) => !nextAbilities.has(name));
      await this.ensureRemovedPokemonAbilitiesAreUnused(transaction, pokemonId, removedNames);
    }

    const graph = await transaction.pokemon.findMany({
      select: { id: true, basePokemonId: true, isMega: true },
    });
    if (
      input.basePokemonId !== null &&
      !graph.some((pokemon) => pokemon.id === input.basePokemonId)
    ) {
      this.throwInvalidReference("basePokemonId", "元ポケモンが存在しません");
    }

    if (pokemonId === null) {
      if (
        input.isMega &&
        graph.find((pokemon) => pokemon.id === input.basePokemonId)?.isMega === true
      ) {
        this.throwInvalidReference("basePokemonId", "メガ形態の元には通常形態を指定してください");
      }
      return;
    }

    const nodes = new Map(
      graph.map((pokemon) => [
        pokemon.id,
        { basePokemonId: pokemon.basePokemonId, isMega: pokemon.isMega },
      ]),
    );
    nodes.set(pokemonId, { basePokemonId: input.basePokemonId, isMega: input.isMega });

    for (const [id, node] of nodes) {
      if (node.isMega && node.basePokemonId !== null && nodes.get(node.basePokemonId)?.isMega) {
        this.throwInvalidReference(
          id === pokemonId ? "basePokemonId" : "isMega",
          "メガ形態の元には通常形態を指定してください",
        );
      }
      const visited = new Set<number>();
      let current: number | null = id;
      while (current !== null) {
        if (visited.has(current)) {
          this.throwInvalidReference("basePokemonId", "元ポケモンの参照が循環します");
        }
        visited.add(current);
        current = nodes.get(current)?.basePokemonId ?? null;
      }
    }
  }

  private async ensureRemovedPokemonAbilitiesAreUnused(
    transaction: Prisma.TransactionClient,
    pokemonId: number,
    removedAbilityNames: string[],
  ): Promise<void> {
    if (removedAbilityNames.length === 0) {
      return;
    }
    const abilities = await transaction.ability.findMany({
      where: { nameJa: { in: removedAbilityNames } },
      select: { id: true },
    });
    if (abilities.length !== removedAbilityNames.length) {
      this.throwInvalidReference("abilities", "既存の特性参照が不正です");
    }
    const abilityIds = abilities.map((ability) => ability.id);
    const [partyCount, archetypeCount, observationCount] = await Promise.all([
      transaction.partyPokemon.count({
        where: { pokemonId, abilityId: { in: abilityIds } },
      }),
      transaction.archetypePokemon.count({
        where: { pokemonId, abilityId: { in: abilityIds } },
      }),
      transaction.observation.count({
        where: { pokemonId, abilityId: { in: abilityIds } },
      }),
    ]);
    if (partyCount + archetypeCount + observationCount > 0) {
      this.throwConflict();
    }
  }

  private async ensureRemovedPokemonMovesAreUnused(
    transaction: Prisma.TransactionClient,
    pokemonId: number,
    removedMoveIds: number[],
  ): Promise<void> {
    if (removedMoveIds.length === 0) {
      return;
    }
    const [partyCount, archetypeCount, observationCount] = await Promise.all([
      transaction.partyPokemonMove.count({
        where: {
          moveId: { in: removedMoveIds },
          partyPokemon: { pokemonId },
        },
      }),
      transaction.archetypePokemonMove.count({
        where: {
          moveId: { in: removedMoveIds },
          archetypePokemon: { pokemonId },
        },
      }),
      transaction.observation.count({
        where: {
          pokemonId,
          moveId: { in: removedMoveIds },
        },
      }),
    ]);
    if (partyCount + archetypeCount + observationCount > 0) {
      this.throwConflict();
    }
  }

  private async ensureExists<T>(
    kind: MasterKind,
    _id: number,
    query: Promise<T | null>,
  ): Promise<T> {
    const record = await query;
    if (!record) {
      this.throwNotFound(kind);
    }
    return record;
  }

  private async deleteMaster(kind: MasterKind, operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        this.throwNotFound(kind);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2003" || error.code === "P2014")
      ) {
        this.throwConflict();
      }
      throw error;
    }
  }

  private serializePokemon(record: PokemonRecord): AdminPokemon {
    return adminPokemonSchema.parse({
      ...record,
      abilities: pokemonAbilitiesSchema.parse(record.abilities),
    });
  }

  private serializeMove(record: MoveRecord): AdminMove {
    return adminMoveSchema.parse(record);
  }

  private serializeItem(record: ItemRecord): AdminItem {
    return adminItemSchema.parse(record);
  }

  private serializeAbility(record: AbilityRecord): AdminAbility {
    return adminAbilitySchema.parse(record);
  }

  private translateWriteError(error: unknown, kind: MasterKind): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        this.throwConflict();
      }
      if (error.code === "P2003" || error.code === "P2014") {
        this.throwInvalidReference("reference", "参照先が存在しないか、参照整合性を満たしません");
      }
      if (error.code === "P2025") {
        this.throwNotFound(kind);
      }
      if (error.code === "P2004" || error.code === "P2011") {
        const problem: ProblemDetails = {
          type: "about:blank",
          title: "Validation Failed",
          status: 400,
          code: "VALIDATION_ERROR",
        };
        throw new BadRequestException(problem);
      }
    }
    throw error;
  }

  private throwInvalidReference(path: string, message: string): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Master Reference",
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
      errors: [{ path, message }],
    };
    throw new BadRequestException(problem);
  }

  private throwNotFound(kind: MasterKind): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: `${kind} Not Found`,
      status: 404,
      code: "NOT_FOUND",
    };
    throw new NotFoundException(problem);
  }

  private throwConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Master Conflict",
      status: 409,
      code: "MASTER_CONFLICT",
    };
    throw new ConflictException(problem);
  }
}
