import { z } from "zod";
import { ruleMasterSchema, ruleRecordSchema } from "../master/rule";
import { calendarDateSchema, seasonMasterSchema } from "../master/season";

/**
 * ARCHETYPE-003 A-03: シーズン・ルール管理 API(PRODUCT_SPEC §10.2 GET/POST /admin/seasons・/admin/rules)。
 *
 * 入力は MASTER-004 で定義済みの seasonMasterSchema / ruleMasterSchema を再利用する
 * (期間の前後関係・pickSize <= teamSize などの業務検証を共通化する)。
 */

const masterIdSchema = z.number().int().positive();
const seasonNameSchema = z.string().trim().min(1).max(100);
const nonNegativeIntSchema = z.number().int().nonnegative();

/** 数値パスパラメータ(/admin/seasons/:id 等)。文字列を安全に整数へ変換する。 */
export const adminSeasonIdParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export type AdminSeasonIdParams = z.infer<typeof adminSeasonIdParamsSchema>;

export const adminSeasonCreateSchema = seasonMasterSchema;
export type AdminSeasonCreate = z.infer<typeof adminSeasonCreateSchema>;

export const adminSeasonSchema = z
  .object({
    id: masterIdSchema,
    name: seasonNameSchema,
    startsAt: calendarDateSchema,
    endsAt: calendarDateSchema,
  })
  .strict();

export type AdminSeason = z.infer<typeof adminSeasonSchema>;

export const adminSeasonListResponseSchema = z
  .object({
    items: z.array(adminSeasonSchema),
  })
  .strict();

export type AdminSeasonListResponse = z.infer<typeof adminSeasonListResponseSchema>;

export const adminRuleCreateSchema = ruleMasterSchema;
export type AdminRuleCreate = z.infer<typeof adminRuleCreateSchema>;

export const adminRuleSchema = ruleRecordSchema;

export type AdminRule = z.infer<typeof adminRuleSchema>;

export const adminRuleListResponseSchema = z
  .object({
    items: z.array(adminRuleSchema),
  })
  .strict();

export type AdminRuleListResponse = z.infer<typeof adminRuleListResponseSchema>;

/**
 * シーズン終了時の一括アーカイブ結果(PRODUCT_SPEC §13.2「シーズン終了時に旧構築を一括で archived へ」)。
 * 対象は指定シーズンの published 構築のみ。archivedCount は今回 archived にした件数。
 */
export const adminSeasonArchiveResponseSchema = z
  .object({
    seasonId: masterIdSchema,
    archivedCount: nonNegativeIntSchema,
  })
  .strict();

export type AdminSeasonArchiveResponse = z.infer<typeof adminSeasonArchiveResponseSchema>;
