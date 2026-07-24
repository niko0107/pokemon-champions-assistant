import { z } from "zod";

const ruleNameSchema = z.string().trim().min(1, "ルール名は1文字以上必要です");
const partySizeSchema = z.number().int().min(1).max(6);

/** ルールマスタ1件の入力値。 */
export const ruleMasterSchema = z
  .object({
    name: ruleNameSchema,
    teamSize: partySizeSchema,
    pickSize: partySizeSchema,
  })
  .superRefine((rule, context) => {
    if (rule.pickSize > rule.teamSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "選出人数はチーム人数以下にしてください",
        path: ["pickSize"],
      });
    }
  });

export type RuleMaster = z.infer<typeof ruleMasterSchema>;
