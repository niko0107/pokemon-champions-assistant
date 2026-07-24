import { z } from "zod";
import { ITEM_TAGS } from "../enums";

const itemNameSchema = z.string().trim().min(1, "持ち物名は1文字以上必要です");

export const itemTagSchema = z.enum(ITEM_TAGS);

/** items.effect_tags JSONB に保存する効果分類。タグなしの持ち物は空配列。 */
export const itemEffectTagsSchema = z.array(itemTagSchema).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "持ち物タグは重複できません",
    });
  }
});

/** 持ち物マスタ1件の入力値。 */
export const itemMasterSchema = z.object({
  nameJa: itemNameSchema,
  nameEn: itemNameSchema,
  effectTags: itemEffectTagsSchema,
});

export type ItemMaster = z.infer<typeof itemMasterSchema>;
export type ItemEffectTags = z.infer<typeof itemEffectTagsSchema>;
