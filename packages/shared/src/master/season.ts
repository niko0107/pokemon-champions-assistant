import { z } from "zod";

const seasonNameSchema = z.string().trim().min(1, "シーズン名は1文字以上必要です");

/** APIで受け渡すYYYY-MM-DD形式の暦日。 */
export const calendarDateSchema = z.string().date("日付は有効なYYYY-MM-DD形式で指定してください");

/** シーズンマスタ1件の入力値。 */
export const seasonMasterSchema = z
  .object({
    name: seasonNameSchema,
    startsAt: calendarDateSchema,
    endsAt: calendarDateSchema,
  })
  .superRefine((season, context) => {
    if (season.endsAt < season.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "終了日は開始日以降にしてください",
        path: ["endsAt"],
      });
    }
  });

export type CalendarDate = z.infer<typeof calendarDateSchema>;
export type SeasonMaster = z.infer<typeof seasonMasterSchema>;
