import { z } from "zod";
import {
  archetypeEvsSchema,
  archetypeStatPointsSchema,
  type ArchetypeStatPoints,
} from "./archetype";
import { combatActualStatsSchema, type CombatActualStats } from "./combat-stats";

export const PARTY_NAME_MAX_LENGTH = 100;
export const PARTY_TEAM_SIZE_MIN = 1;
export const PARTY_TEAM_SIZE_MAX = 6;
export const PARTY_MOVE_COUNT_MIN = 1;
export const PARTY_MOVE_COUNT_MAX = 4;
export const PARTY_IV_STAT_MAX = 31;

const positiveMasterIdSchema = z.number().int().positive();
const nullableMasterIdSchema = positiveMasterIdSchema.nullable().default(null);
const requiredTextSchema = z.string().trim().min(1);
const nullableTextSchema = requiredTextSchema.nullable().default(null);
const individualValueSchema = z.number().int().min(0).max(PARTY_IV_STAT_MAX);

export const partySlotSchema = z.number().int().min(1).max(PARTY_TEAM_SIZE_MAX);
export const partyMoveSlotSchema = z.number().int().min(1).max(PARTY_MOVE_COUNT_MAX);

/**
 * party_pokemons.evs。
 * テンプレ構築と同じ6能力・各252以下・合計510以下の契約を再利用する。
 */
export const partyEvsSchema = archetypeEvsSchema;

/** party_pokemons.stat_points。Archetypeと同じChampions能力ポイント契約を再利用する。 */
export const partyStatPointsSchema = archetypeStatPointsSchema;

/** party_pokemons.ivs。nullは未確認を表し、31などへ暗黙補完しない。 */
export const partyIvsSchema = z
  .object({
    hp: individualValueSchema,
    atk: individualValueSchema,
    def: individualValueSchema,
    spa: individualValueSchema,
    spd: individualValueSchema,
    spe: individualValueSchema,
  })
  .strict();

/** party_pokemons.actual_stats。直接入力する場合は確定済みの6能力を揃える。 */
export const partyActualStatsSchema = combatActualStatsSchema;

export const partyPokemonMoveSchema = z
  .object({
    slot: partyMoveSlotSchema,
    moveId: positiveMasterIdSchema,
  })
  .strict();

const partyPokemonBaseSchema = z
  .object({
    slot: partySlotSchema,
    pokemonId: positiveMasterIdSchema,
    itemId: nullableMasterIdSchema,
    abilityId: nullableMasterIdSchema,
    nature: requiredTextSchema,
    teraType: nullableTextSchema,
    evs: partyEvsSchema.nullable().default(null),
    statPoints: partyStatPointsSchema.nullable().default(null),
    ivs: partyIvsSchema.nullable().default(null),
    actualStats: partyActualStatsSchema.nullable().default(null),
    moves: z
      .array(partyPokemonMoveSchema)
      .min(PARTY_MOVE_COUNT_MIN, "技を1件以上指定してください")
      .max(PARTY_MOVE_COUNT_MAX, `技は${PARTY_MOVE_COUNT_MAX}件以下にしてください`),
  })
  .strict();

function validatePokemonMoveUniqueness(
  pokemon: z.infer<typeof partyPokemonBaseSchema>,
  context: z.RefinementCtx,
): void {
  const moveSlots = pokemon.moves.map((move) => move.slot);
  if (new Set(moveSlots).size !== moveSlots.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "同じポケモン内の技slotは重複できません",
      path: ["moves"],
    });
  }

  const moveIds = pokemon.moves.map((move) => move.moveId);
  if (new Set(moveIds).size !== moveIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "同じポケモンへ同じ技を重複指定できません",
      path: ["moves"],
    });
  }
}

/** 保存済みPartyの互換レスポンス。従来データでは実数値や能力ポイントがnullになり得る。 */
export const partyPokemonSchema = partyPokemonBaseSchema.superRefine(validatePokemonMoveUniqueness);

/** 新規作成・全置換更新。ゲーム画面で確認した実数値6項目を必須にする。 */
export const partyPokemonWriteSchema = partyPokemonBaseSchema
  .extend({
    statPoints: partyStatPointsSchema.nullable(),
    actualStats: partyActualStatsSchema,
  })
  .superRefine(validatePokemonMoveUniqueness);

function validatePartyPokemonUniqueness(
  party: { pokemons: ReadonlyArray<{ slot: number; pokemonId: number }> },
  context: z.RefinementCtx,
): void {
  const slots = party.pokemons.map((pokemon) => pokemon.slot);
  if (new Set(slots).size !== slots.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "パーティ内のslotは重複できません",
      path: ["pokemons"],
    });
  }

  const pokemonIds = party.pokemons.map((pokemon) => pokemon.pokemonId);
  if (new Set(pokemonIds).size !== pokemonIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "パーティ内のポケモンは重複できません",
      path: ["pokemons"],
    });
  }
}

const partyBaseFields = {
  name: requiredTextSchema.max(PARTY_NAME_MAX_LENGTH),
  description: nullableTextSchema,
  ruleId: positiveMasterIdSchema,
  isActive: z.boolean().default(false),
} as const;

/**
 * PARTY-001の共通パーティ契約。
 * Rule.teamSizeとの一致、習得可能技、所持可能特性はPARTY-002のAPIで検証する。
 */
export const partySchema = z
  .object({
    ...partyBaseFields,
    pokemons: z
      .array(partyPokemonSchema)
      .min(PARTY_TEAM_SIZE_MIN, "ポケモンを1体以上指定してください")
      .max(PARTY_TEAM_SIZE_MAX, `ポケモンは${PARTY_TEAM_SIZE_MAX}体以下にしてください`),
  })
  .strict()
  .superRefine(validatePartyPokemonUniqueness);

/** Party POST / PUTの内容契約。互換レスポンスと異なりactualStatsを必須にする。 */
export const partyWriteContentSchema = z
  .object({
    ...partyBaseFields,
    pokemons: z
      .array(partyPokemonWriteSchema)
      .min(PARTY_TEAM_SIZE_MIN, "ポケモンを1体以上指定してください")
      .max(PARTY_TEAM_SIZE_MAX, `ポケモンは${PARTY_TEAM_SIZE_MAX}体以下にしてください`),
  })
  .strict()
  .superRefine(validatePartyPokemonUniqueness);

export type PartyEvs = z.infer<typeof partyEvsSchema>;
export type PartyStatPoints = ArchetypeStatPoints;
export type PartyIvs = z.infer<typeof partyIvsSchema>;
export type PartyActualStats = CombatActualStats;
export type PartyPokemonMove = z.infer<typeof partyPokemonMoveSchema>;
export type PartyPokemon = z.infer<typeof partyPokemonSchema>;
export type PartyPokemonWrite = z.infer<typeof partyPokemonWriteSchema>;
export type Party = z.infer<typeof partySchema>;
