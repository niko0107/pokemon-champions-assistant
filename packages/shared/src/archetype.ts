import { z } from "zod";
import { ARCHETYPE_STATUSES, POKEMON_ROLES, POPULARITY_TIERS } from "./enums";

export const ARCHETYPE_TEAM_SIZE_MAX = 6;
export const ARCHETYPE_EV_STAT_MAX = 252;
export const ARCHETYPE_EV_TOTAL_MAX = 510;
export const ARCHETYPE_IV_STAT_MAX = 31;
export const ARCHETYPE_STAT_DATA_STATUSES = ["exact", "derived", "partial"] as const;

export const archetypePopularityTierSchema = z.enum(POPULARITY_TIERS);
export const archetypeStatusSchema = z.enum(ARCHETYPE_STATUSES);
export const archetypePokemonRoleSchema = z.enum(POKEMON_ROLES);
export const archetypeStatDataStatusSchema = z.enum(ARCHETYPE_STAT_DATA_STATUSES);

export const archetypeSlotSchema = z.number().int().min(1).max(ARCHETYPE_TEAM_SIZE_MAX);

/**
 * archetypes.default_leads。
 *
 * 空配列は出典から一意な基本選出を確認できない状態を表す。登録がある場合は配列順を
 * 選出順とし、先頭を基本先発として扱う。Rule.pickSizeとの件数整合はRuleを取得できる
 * API Serviceで検証する。
 */
export const archetypeDefaultLeadsSchema = z
  .array(archetypeSlotSchema)
  .max(ARCHETYPE_TEAM_SIZE_MAX)
  .superRefine((slots, context) => {
    if (new Set(slots).size !== slots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "基本選出のslotは重複できません",
      });
    }
  });

/** Ruleを取得済みの境界で、基本選出を空またはpickSize件だけに制限する。 */
export function archetypeDefaultLeadsForPickSizeSchema(pickSize: number) {
  return archetypeDefaultLeadsSchema.superRefine((slots, context) => {
    if (slots.length !== 0 && slots.length !== pickSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `基本選出数は0件またはルールのpickSize（${pickSize}）件にしてください`,
      });
    }
  });
}

/** archetype_pokemons.item_alternatives。自動採番IDはAPIで存在確認してから保存する。 */
export const archetypeItemAlternativeIdsSchema = z
  .array(z.number().int().positive())
  .superRefine((itemIds, context) => {
    if (new Set(itemIds).size !== itemIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "代替持ち物IDは重複できません",
      });
    }
  });

const effortValueSchema = z.number().int().min(0).max(ARCHETYPE_EV_STAT_MAX);

/** archetype_pokemons.evs。指定する場合は6能力を揃え、合計510以下とする。 */
export const archetypeEvsSchema = z
  .object({
    hp: effortValueSchema,
    atk: effortValueSchema,
    def: effortValueSchema,
    spa: effortValueSchema,
    spd: effortValueSchema,
    spe: effortValueSchema,
  })
  .strict()
  .superRefine((evs, context) => {
    const total = Object.values(evs).reduce((sum, value) => sum + value, 0);
    if (total > ARCHETYPE_EV_TOTAL_MAX) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `努力値の合計は${ARCHETYPE_EV_TOTAL_MAX}以下にしてください`,
      });
    }
  });

const individualValueSchema = z.number().int().min(0).max(ARCHETYPE_IV_STAT_MAX);

/**
 * 出典で確認できた個体値。nullの能力は未確認を表し、31などへ暗黙補完しない。
 * オブジェクト全体のnullは、どの能力についてもIV情報がない状態を表す。
 */
export const archetypeIvsSchema = z
  .object({
    hp: individualValueSchema.nullable(),
    atk: individualValueSchema.nullable(),
    def: individualValueSchema.nullable(),
    spa: individualValueSchema.nullable(),
    spd: individualValueSchema.nullable(),
    spe: individualValueSchema.nullable(),
  })
  .strict();

/** 全6能力のIVが出典で確認済みで、実数値を厳密に算出できる場合の契約。 */
export const completeArchetypeIvsSchema = z
  .object({
    hp: individualValueSchema,
    atk: individualValueSchema,
    def: individualValueSchema,
    spa: individualValueSchema,
    spd: individualValueSchema,
    spe: individualValueSchema,
  })
  .strict();

export type ArchetypePopularityTier = z.infer<typeof archetypePopularityTierSchema>;
export type ArchetypeStatusValue = z.infer<typeof archetypeStatusSchema>;
export type ArchetypePokemonRoleValue = z.infer<typeof archetypePokemonRoleSchema>;
export type ArchetypeStatDataStatus = z.infer<typeof archetypeStatDataStatusSchema>;
export type ArchetypeDefaultLeads = z.infer<typeof archetypeDefaultLeadsSchema>;
export type ArchetypeItemAlternativeIds = z.infer<typeof archetypeItemAlternativeIdsSchema>;
export type ArchetypeEvs = z.infer<typeof archetypeEvsSchema>;
export type ArchetypeIvs = z.infer<typeof archetypeIvsSchema>;
export type CompleteArchetypeIvs = z.infer<typeof completeArchetypeIvsSchema>;
