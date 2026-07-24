import { z } from "zod";
import { MOVE_CATEGORIES, MOVE_TAGS } from "../enums";

const moveNameSchema = z.string().trim().min(1, "技名は1文字以上必要です");
const moveTypeSchema = z.string().trim().min(1, "技タイプは1文字以上必要です");

export const moveCategorySchema = z.enum(MOVE_CATEGORIES);
export const moveTagSchema = z.enum(MOVE_TAGS);

/** moves.tags JSONB に保存する警戒・分類タグ。タグなしの技は空配列。 */
export const moveTagsSchema = z.array(moveTagSchema).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "技タグは重複できません",
    });
  }
});

/** 技マスタ1件の入力値。 */
export const moveMasterSchema = z.object({
  nameJa: moveNameSchema,
  nameEn: moveNameSchema,
  type: moveTypeSchema,
  category: moveCategorySchema,
  power: z.number().int().min(1).max(300).nullable(),
  accuracy: z.number().int().min(1).max(100).nullable(),
  priority: z.number().int().min(-7).max(5),
  tags: moveTagsSchema,
});

export type MoveMaster = z.infer<typeof moveMasterSchema>;
export type MoveTags = z.infer<typeof moveTagsSchema>;
