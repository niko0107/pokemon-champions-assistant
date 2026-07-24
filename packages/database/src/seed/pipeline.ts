import { pokemonMoveSchema } from "@pokemon-champions/shared";
import type { Prisma } from "../index";
import {
  getPokemonSeedKey,
  orderPokemonsByBaseForm,
  type SampleMasterData,
  validateSampleMasterData,
} from "./schema";

export const seedEntityNames = [
  "pokemons",
  "moves",
  "items",
  "abilities",
  "pokemonMoves",
  "seasons",
  "rules",
] as const;

export type SeedEntityName = (typeof seedEntityNames)[number];

export interface SeedChangeCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export type SeedSummary = Record<SeedEntityName | "total", SeedChangeCounts>;

export interface SeedTransactionRunner {
  $transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

function emptyCounts(): SeedChangeCounts {
  return { created: 0, updated: 0, unchanged: 0 };
}

function createEmptySummary(): SeedSummary {
  return {
    pokemons: emptyCounts(),
    moves: emptyCounts(),
    items: emptyCounts(),
    abilities: emptyCounts(),
    pokemonMoves: emptyCounts(),
    seasons: emptyCounts(),
    rules: emptyCounts(),
    total: emptyCounts(),
  };
}

function increment(
  summary: SeedSummary,
  entity: SeedEntityName,
  change: keyof SeedChangeCounts,
): void {
  summary[entity][change] += 1;
  summary.total[change] += 1;
}

function jsonStringArrayEquals(actual: Prisma.JsonValue, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function seedAbilities(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<void> {
  for (const ability of data.abilities) {
    const existing = await transaction.ability.findUnique({
      where: { nameEn: ability.nameEn },
    });

    if (!existing) {
      await transaction.ability.create({ data: ability });
      increment(summary, "abilities", "created");
    } else if (
      existing.nameJa === ability.nameJa &&
      jsonStringArrayEquals(existing.effectTags, ability.effectTags)
    ) {
      increment(summary, "abilities", "unchanged");
    } else {
      await transaction.ability.update({
        where: { id: existing.id },
        data: ability,
      });
      increment(summary, "abilities", "updated");
    }
  }
}

async function seedItems(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<void> {
  for (const item of data.items) {
    const existing = await transaction.item.findUnique({
      where: { nameEn: item.nameEn },
    });

    if (!existing) {
      await transaction.item.create({ data: item });
      increment(summary, "items", "created");
    } else if (
      existing.nameJa === item.nameJa &&
      jsonStringArrayEquals(existing.effectTags, item.effectTags)
    ) {
      increment(summary, "items", "unchanged");
    } else {
      await transaction.item.update({
        where: { id: existing.id },
        data: item,
      });
      increment(summary, "items", "updated");
    }
  }
}

async function seedMoves(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<Map<string, number>> {
  const moveIds = new Map<string, number>();

  for (const move of data.moves) {
    const existing = await transaction.move.findUnique({
      where: { nameEn: move.nameEn },
    });

    if (!existing) {
      const created = await transaction.move.create({ data: move });
      moveIds.set(move.nameEn, created.id);
      increment(summary, "moves", "created");
    } else {
      moveIds.set(move.nameEn, existing.id);
      if (
        existing.nameJa === move.nameJa &&
        existing.type === move.type &&
        existing.category === move.category &&
        existing.power === move.power &&
        existing.accuracy === move.accuracy &&
        existing.priority === move.priority &&
        jsonStringArrayEquals(existing.tags, move.tags)
      ) {
        increment(summary, "moves", "unchanged");
      } else {
        await transaction.move.update({
          where: { id: existing.id },
          data: move,
        });
        increment(summary, "moves", "updated");
      }
    }
  }

  return moveIds;
}

async function seedPokemons(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<Map<string, number>> {
  const pokemonIds = new Map<string, number>();

  for (const pokemon of orderPokemonsByBaseForm(data.pokemons)) {
    const basePokemonId = pokemon.basePokemon
      ? pokemonIds.get(getPokemonSeedKey(pokemon.basePokemon))
      : null;

    if (pokemon.basePokemon && basePokemonId === undefined) {
      throw new Error(
        `元ポケモンを解決できません: dexNo=${pokemon.basePokemon.dexNo}, form=${pokemon.basePokemon.form}`,
      );
    }

    const writeData = {
      dexNo: pokemon.dexNo,
      nameJa: pokemon.nameJa,
      nameEn: pokemon.nameEn,
      form: pokemon.form,
      type1: pokemon.type1,
      type2: pokemon.type2,
      baseHp: pokemon.baseHp,
      baseAtk: pokemon.baseAtk,
      baseDef: pokemon.baseDef,
      baseSpa: pokemon.baseSpa,
      baseSpd: pokemon.baseSpd,
      baseSpe: pokemon.baseSpe,
      abilities: pokemon.abilities,
      isMega: pokemon.isMega,
      basePokemonId,
    };
    const existing = await transaction.pokemon.findUnique({
      where: {
        dexNo_form: {
          dexNo: pokemon.dexNo,
          form: pokemon.form,
        },
      },
    });

    if (!existing) {
      const created = await transaction.pokemon.create({ data: writeData });
      pokemonIds.set(getPokemonSeedKey(pokemon), created.id);
      increment(summary, "pokemons", "created");
    } else {
      pokemonIds.set(getPokemonSeedKey(pokemon), existing.id);
      if (
        existing.nameJa === pokemon.nameJa &&
        existing.nameEn === pokemon.nameEn &&
        existing.type1 === pokemon.type1 &&
        existing.type2 === pokemon.type2 &&
        existing.baseHp === pokemon.baseHp &&
        existing.baseAtk === pokemon.baseAtk &&
        existing.baseDef === pokemon.baseDef &&
        existing.baseSpa === pokemon.baseSpa &&
        existing.baseSpd === pokemon.baseSpd &&
        existing.baseSpe === pokemon.baseSpe &&
        jsonStringArrayEquals(existing.abilities, pokemon.abilities) &&
        existing.isMega === pokemon.isMega &&
        existing.basePokemonId === basePokemonId
      ) {
        increment(summary, "pokemons", "unchanged");
      } else {
        await transaction.pokemon.update({
          where: { id: existing.id },
          data: writeData,
        });
        increment(summary, "pokemons", "updated");
      }
    }
  }

  return pokemonIds;
}

async function seedPokemonMoves(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  pokemonIds: ReadonlyMap<string, number>,
  moveIds: ReadonlyMap<string, number>,
  summary: SeedSummary,
): Promise<void> {
  for (const pokemonMove of data.pokemonMoves) {
    const pokemonId = pokemonIds.get(getPokemonSeedKey(pokemonMove.pokemon));
    const moveId = moveIds.get(pokemonMove.moveNameEn);

    if (pokemonId === undefined || moveId === undefined) {
      throw new Error(
        `PokemonMoveの参照を解決できません: dexNo=${pokemonMove.pokemon.dexNo}, form=${pokemonMove.pokemon.form}, move=${pokemonMove.moveNameEn}`,
      );
    }

    const ids = pokemonMoveSchema.parse({ pokemonId, moveId });
    const existing = await transaction.pokemonMove.findUnique({
      where: { pokemonId_moveId: ids },
    });

    if (existing) {
      increment(summary, "pokemonMoves", "unchanged");
    } else {
      await transaction.pokemonMove.create({ data: ids });
      increment(summary, "pokemonMoves", "created");
    }
  }
}

async function seedSeasons(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<void> {
  for (const season of data.seasons) {
    const startsAt = calendarDate(season.startsAt);
    const endsAt = calendarDate(season.endsAt);
    const existing = await transaction.season.findUnique({
      where: { name: season.name },
    });

    if (!existing) {
      await transaction.season.create({
        data: { name: season.name, startsAt, endsAt },
      });
      increment(summary, "seasons", "created");
    } else if (
      existing.startsAt.getTime() === startsAt.getTime() &&
      existing.endsAt.getTime() === endsAt.getTime()
    ) {
      increment(summary, "seasons", "unchanged");
    } else {
      await transaction.season.update({
        where: { id: existing.id },
        data: { name: season.name, startsAt, endsAt },
      });
      increment(summary, "seasons", "updated");
    }
  }
}

async function seedRules(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
  summary: SeedSummary,
): Promise<void> {
  for (const rule of data.rules) {
    const existing = await transaction.rule.findUnique({
      where: { name: rule.name },
    });

    if (!existing) {
      await transaction.rule.create({ data: rule });
      increment(summary, "rules", "created");
    } else if (existing.teamSize === rule.teamSize && existing.pickSize === rule.pickSize) {
      increment(summary, "rules", "unchanged");
    } else {
      await transaction.rule.update({
        where: { id: existing.id },
        data: rule,
      });
      increment(summary, "rules", "updated");
    }
  }
}

async function writeMasterData(
  transaction: Prisma.TransactionClient,
  data: SampleMasterData,
): Promise<SeedSummary> {
  const summary = createEmptySummary();

  await seedAbilities(transaction, data, summary);
  await seedItems(transaction, data, summary);
  const moveIds = await seedMoves(transaction, data, summary);
  const pokemonIds = await seedPokemons(transaction, data, summary);
  await seedPokemonMoves(transaction, data, pokemonIds, moveIds, summary);
  await seedSeasons(transaction, data, summary);
  await seedRules(transaction, data, summary);

  return summary;
}

/**
 * 全入力をDBアクセス前に検証し、全マスタを単一トランザクションで冪等投入する。
 */
export async function seedSampleMasters(
  database: SeedTransactionRunner,
  input: unknown,
): Promise<SeedSummary> {
  const data = validateSampleMasterData(input);

  try {
    return await database.$transaction((transaction) => writeMasterData(transaction, data));
  } catch (error) {
    throw new Error(
      `マスタ投入に失敗しました。トランザクションはロールバックされました: ${errorMessage(error)}`,
    );
  }
}
