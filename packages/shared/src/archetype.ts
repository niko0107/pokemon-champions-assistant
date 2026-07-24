import { z } from "zod";
import { ARCHETYPE_STATUSES, POKEMON_ROLES, POPULARITY_TIERS } from "./enums";

export const ARCHETYPE_TEAM_SIZE_MAX = 6;
export const ARCHETYPE_EV_STAT_MAX = 252;
export const ARCHETYPE_EV_TOTAL_MAX = 510;

export const archetypePopularityTierSchema = z.enum(POPULARITY_TIERS);
export const archetypeStatusSchema = z.enum(ARCHETYPE_STATUSES);
export const archetypePokemonRoleSchema = z.enum(POKEMON_ROLES);

export const archetypeSlotSchema = z.number().int().min(1).max(ARCHETYPE_TEAM_SIZE_MAX);

/** archetypes.default_leads。配列順を選出順とし、先頭を基本先発として扱う。 */
export const archetypeDefaultLeadsSchema = z
  .array(archetypeSlotSchema)
  .min(1, "基本選出を1枠以上指定してください")
  .max(ARCHETYPE_TEAM_SIZE_MAX)
  .superRefine((slots, context) => {
    if (new Set(slots).size !== slots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "基本選出のslotは重複できません",
      });
    }
  });

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

export type ArchetypePopularityTier = z.infer<typeof archetypePopularityTierSchema>;
export type ArchetypeStatusValue = z.infer<typeof archetypeStatusSchema>;
export type ArchetypePokemonRoleValue = z.infer<typeof archetypePokemonRoleSchema>;
export type ArchetypeDefaultLeads = z.infer<typeof archetypeDefaultLeadsSchema>;
export type ArchetypeItemAlternativeIds = z.infer<typeof archetypeItemAlternativeIdsSchema>;
export type ArchetypeEvs = z.infer<typeof archetypeEvsSchema>;
