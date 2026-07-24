import { z } from "zod";
import { ABILITY_TAGS } from "../enums";

const abilityNameSchema = z.string().trim().min(1, "特性名は1文字以上必要です");

export const abilityTagSchema = z.enum(ABILITY_TAGS);

/** abilities.effect_tags JSONB に保存する効果分類。タグなしの特性は空配列。 */
export const abilityEffectTagsSchema = z.array(abilityTagSchema).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "特性タグは重複できません",
    });
  }
});

/** 特性マスタ1件の入力値。 */
export const abilityMasterSchema = z.object({
  nameJa: abilityNameSchema,
  nameEn: abilityNameSchema,
  effectTags: abilityEffectTagsSchema,
});

export type AbilityMaster = z.infer<typeof abilityMasterSchema>;
export type AbilityEffectTags = z.infer<typeof abilityEffectTagsSchema>;
