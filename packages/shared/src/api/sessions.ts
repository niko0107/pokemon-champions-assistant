import { z } from "zod";
import { BATTLE_SESSION_STATUSES } from "../enums";

const timestampSchema = z.string().datetime({ offset: true });

export const battleSessionStatusSchema = z.enum(BATTLE_SESSION_STATUSES);

export const battleSessionCreateSchema = z
  .object({
    partyId: z.string().uuid(),
    ruleId: z.number().int().positive(),
  })
  .strict();

export type BattleSessionCreate = z.infer<typeof battleSessionCreateSchema>;

export const battleSessionIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type BattleSessionIdParams = z.infer<typeof battleSessionIdParamsSchema>;

export const battleSessionResponseSchema = z
  .object({
    id: z.string().uuid(),
    partyId: z.string().uuid(),
    ruleId: z.number().int().positive(),
    status: battleSessionStatusSchema,
    startedAt: timestampSchema,
    endedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type BattleSessionResponse = z.infer<typeof battleSessionResponseSchema>;
