import { z } from "zod";
import { ruleRecordSchema } from "../master/rule";

/** GET /api/v1/master/rules の公開Rule一覧契約。 */
export const masterRuleSchema = ruleRecordSchema;

export type MasterRule = z.infer<typeof masterRuleSchema>;

export const masterRulesResponseSchema = z
  .object({
    items: z.array(masterRuleSchema),
  })
  .strict();

export type MasterRulesResponse = z.infer<typeof masterRulesResponseSchema>;
