import type { CounterplanResult } from "@pokemon-champions/matchup";
import { sessionCounterplanResponseSchema } from "@pokemon-champions/shared";
import { z } from "zod";

export const counterplanResultSchema = sessionCounterplanResponseSchema
  .pick({
    perOpponent: true,
    selection: true,
    playstyleNotes: true,
    strategyCodes: true,
    cautionMoves: true,
    threatNotes: true,
  })
  .strict();

export const llmExplanationJobPayloadSchema = z
  .object({
    input: counterplanResultSchema,
  })
  .strict();

export interface LlmExplanationJobPayload {
  readonly input: CounterplanResult;
}

export function parseLlmExplanationJobPayload(value: unknown): LlmExplanationJobPayload {
  return llmExplanationJobPayloadSchema.parse(value) as LlmExplanationJobPayload;
}
