import { z } from "zod";
import { archetypeEvsSchema } from "./archetype";

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
const actualStatSchema = z.number().int().positive();

export const partySlotSchema = z.number().int().min(1).max(PARTY_TEAM_SIZE_MAX);
export const partyMoveSlotSchema = z.number().int().min(1).max(PARTY_MOVE_COUNT_MAX);

/**
 * party_pokemons.evs。
 * テンプレ構築と同じ6能力・各252以下・合計510以下の契約を再利用する。
 */
export const partyEvsSchema = archetypeEvsSchema;

/** party_pokemons.ivs。nullは全能力31の既定値として扱う。 */
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

/** party_pokemons.actual_stats。直接入力する場合は6能力を揃える。 */
export const partyActualStatsSchema = z
  .object({
    hp: actualStatSchema,
    atk: actualStatSchema,
    def: actualStatSchema,
    spa: actualStatSchema,
    spd: actualStatSchema,
    spe: actualStatSchema,
  })
  .strict();

export const partyPokemonMoveSchema = z
  .object({
    slot: partyMoveSlotSchema,
    moveId: positiveMasterIdSchema,
  })
  .strict();

export const partyPokemonSchema = z
  .object({
    slot: partySlotSchema,
    pokemonId: positiveMasterIdSchema,
    itemId: nullableMasterIdSchema,
    abilityId: nullableMasterIdSchema,
    nature: requiredTextSchema,
    teraType: nullableTextSchema,
    evs: partyEvsSchema,
    ivs: partyIvsSchema.nullable().default(null),
    actualStats: partyActualStatsSchema.nullable().default(null),
    moves: z
      .array(partyPokemonMoveSchema)
      .min(PARTY_MOVE_COUNT_MIN, "技を1件以上指定してください")
      .max(PARTY_MOVE_COUNT_MAX, `技は${PARTY_MOVE_COUNT_MAX}件以下にしてください`),
  })
  .strict()
  .superRefine((pokemon, context) => {
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
  });

/**
 * PARTY-001の共通パーティ契約。
 * Rule.teamSizeとの一致、習得可能技、所持可能特性はPARTY-002のAPIで検証する。
 */
export const partySchema = z
  .object({
    name: requiredTextSchema.max(PARTY_NAME_MAX_LENGTH),
    description: nullableTextSchema,
    ruleId: positiveMasterIdSchema,
    isActive: z.boolean().default(false),
    pokemons: z
      .array(partyPokemonSchema)
      .min(PARTY_TEAM_SIZE_MIN, "ポケモンを1体以上指定してください")
      .max(PARTY_TEAM_SIZE_MAX, `ポケモンは${PARTY_TEAM_SIZE_MAX}体以下にしてください`),
  })
  .strict()
  .superRefine((party, context) => {
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
  });

export type PartyEvs = z.infer<typeof partyEvsSchema>;
export type PartyIvs = z.infer<typeof partyIvsSchema>;
export type PartyActualStats = z.infer<typeof partyActualStatsSchema>;
export type PartyPokemonMove = z.infer<typeof partyPokemonMoveSchema>;
export type PartyPokemon = z.infer<typeof partyPokemonSchema>;
export type Party = z.infer<typeof partySchema>;
