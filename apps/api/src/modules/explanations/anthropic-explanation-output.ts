import {
  counterplanExplanationSchema,
  type CounterplanExplanation,
} from "@pokemon-champions/shared";
import { z } from "zod/v4";

export const ANTHROPIC_SUMMARY_MAX_LENGTH = 400;
export const ANTHROPIC_SELECTION_EXPLANATION_MAX_LENGTH = 1_200;
export const ANTHROPIC_OPPONENT_EXPLANATION_MAX_LENGTH = 1_200;
export const ANTHROPIC_STRATEGY_EXPLANATION_MAX_LENGTH = 1_200;

const htmlPattern = /<!--|<!doctype|<\/?[a-z][^>]*>/iu;

function explanationText(maximum: number) {
  return z
    .string()
    .refine((value) => value.trim().length > 0, "Explanation text must not be blank")
    .refine((value) => value.length <= maximum, "Explanation text is too long")
    .refine((value) => !htmlPattern.test(value), "Explanation text must not contain HTML");
}

export const anthropicCounterplanExplanationSchema = z
  .strictObject({
    summary: explanationText(ANTHROPIC_SUMMARY_MAX_LENGTH),
    selectionExplanation: explanationText(ANTHROPIC_SELECTION_EXPLANATION_MAX_LENGTH),
    perOpponent: z
      .array(
        z.strictObject({
          opponentPokemonId: z.number().int().safe().positive(),
          explanation: explanationText(ANTHROPIC_OPPONENT_EXPLANATION_MAX_LENGTH),
        }),
      )
      .min(1)
      .max(6),
    strategyExplanation: explanationText(ANTHROPIC_STRATEGY_EXPLANATION_MAX_LENGTH).nullable(),
  })
  .superRefine((explanation, context) => {
    const ids = explanation.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Opponent Pokemon IDs must not be duplicated",
        path: ["perOpponent"],
        input: explanation,
      });
    }
  });

export function parseAnthropicCounterplanExplanation(
  value: unknown,
  expectedOpponentPokemonIds: readonly number[],
): CounterplanExplanation {
  const parsed = anthropicCounterplanExplanationSchema.parse(value);
  const receivedIds = parsed.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId);
  if (
    receivedIds.length !== expectedOpponentPokemonIds.length ||
    receivedIds.some((id, index) => id !== expectedOpponentPokemonIds[index])
  ) {
    throw new RangeError("Anthropic explanation opponent Pokemon IDs do not match the input");
  }

  return counterplanExplanationSchema.parse(parsed);
}
