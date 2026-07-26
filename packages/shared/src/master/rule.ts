import { z } from "zod";

const ruleNameSchema = z.string().trim().min(1, "ルール名は1文字以上必要です");
const partySizeSchema = z.number().int().min(1).max(6);

const ruleFields = {
  name: ruleNameSchema,
  teamSize: partySizeSchema,
  pickSize: partySizeSchema,
} as const;

const ruleRecordFields = {
  ...ruleFields,
  name: ruleNameSchema.max(100, "ルール名は100文字以下にしてください"),
} as const;

function validatePickSize(
  rule: { teamSize: number; pickSize: number },
  context: z.RefinementCtx,
): void {
  if (rule.pickSize > rule.teamSize) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "選出人数はチーム人数以下にしてください",
      path: ["pickSize"],
    });
  }
}

/** ルールマスタ1件の入力値。 */
export const ruleMasterSchema = z.object(ruleFields).superRefine(validatePickSize);

export type RuleMaster = z.infer<typeof ruleMasterSchema>;

/** DB保存済みRuleの安全な公開形状。管理・一般向けAPIで共通利用する。 */
export const ruleRecordSchema = z
  .object({
    id: z.number().int().positive(),
    ...ruleRecordFields,
  })
  .strict()
  .superRefine(validatePickSize);

export type RuleRecord = z.infer<typeof ruleRecordSchema>;
