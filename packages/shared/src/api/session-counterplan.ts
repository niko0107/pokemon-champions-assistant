import { z } from "zod";
import {
  counterplanCautionMoveTagSchema,
  counterplanStrategyCodeSchema,
  knockoutClassificationSchema,
  matchupReasonCodeSchema,
  matchupVerdictSchema,
} from "../matchup";
import { moveCategorySchema } from "../master/move";
import { battleSessionIdParamsSchema } from "./sessions";

const positiveSafeIntegerSchema = z.number().int().safe().positive();
const safeIntegerSchema = z.number().int().safe();
const finiteNumberSchema = z.number().finite();
const rateSchema = finiteNumberSchema.min(0).max(1);
const scoreSchema = safeIntegerSchema.min(-100).max(100);
const typeMultiplierSchema = z.union([
  z.literal(0),
  z.literal(0.25),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(4),
]);

export const sessionCounterplanParamsSchema = battleSessionIdParamsSchema;

export type SessionCounterplanParams = z.infer<typeof sessionCounterplanParamsSchema>;

export const counterplanDamageResultSchema = z
  .object({
    moveId: positiveSafeIntegerSchema,
    category: moveCategorySchema,
    minDamage: safeIntegerSchema.nonnegative(),
    maxDamage: safeIntegerSchema.nonnegative(),
    minDamagePercent: finiteNumberSchema.nonnegative(),
    maxDamagePercent: finiteNumberSchema.nonnegative(),
    typeMultiplier: typeMultiplierSchema,
    stabMultiplier: z.union([z.literal(1), z.literal(1.5)]),
    attackerStat: positiveSafeIntegerSchema.nullable(),
    defenderStat: positiveSafeIntegerSchema.nullable(),
    canDamage: z.boolean(),
    isImmune: z.boolean(),
    knockoutCount: positiveSafeIntegerSchema.nullable(),
    possibleKnockoutCount: positiveSafeIntegerSchema.nullable(),
    knockoutClassification: knockoutClassificationSchema,
  })
  .strict();

export const counterplanMatchupScoreSchema = z
  .object({
    selfPokemonId: positiveSafeIntegerSchema,
    myPokemonId: positiveSafeIntegerSchema,
    opponentPokemonId: positiveSafeIntegerSchema,
    offensiveScore: safeIntegerSchema.min(0).max(30),
    defensiveScore: safeIntegerSchema.min(0).max(30),
    damageRaceScore: safeIntegerSchema.min(-15).max(15),
    totalScore: scoreSchema,
    classification: matchupVerdictSchema,
    bestOffensiveMoveId: positiveSafeIntegerSchema.nullable(),
    mostThreateningMoveId: positiveSafeIntegerSchema.nullable(),
    outgoingDamage: counterplanDamageResultSchema.nullable(),
    incomingDamage: counterplanDamageResultSchema.nullable(),
    outgoingKnockoutCount: positiveSafeIntegerSchema.nullable(),
    incomingKnockoutCount: positiveSafeIntegerSchema.nullable(),
    offensiveTypeMultiplier: typeMultiplierSchema.nullable(),
    defensiveTypeMultiplier: typeMultiplierSchema.nullable(),
    reasonCodes: z.array(matchupReasonCodeSchema),
    score: scoreSchema,
    verdict: matchupVerdictSchema,
    breakdown: z
      .object({
        offense: safeIntegerSchema.min(0).max(30),
        defense: safeIntegerSchema.min(0).max(30),
        speed: safeIntegerSchema.min(-10).max(15),
        damageRace: safeIntegerSchema.min(-15).max(15),
        priority: safeIntegerSchema.min(0).max(5),
        statusResist: safeIntegerSchema.min(0).max(5),
        setupCounter: safeIntegerSchema.min(-10).max(10),
      })
      .strict(),
  })
  .strict();

export const counterplanCautionMoveSchema = z
  .object({
    moveId: positiveSafeIntegerSchema,
    opponentPokemonId: positiveSafeIntegerSchema,
    tags: z.array(counterplanCautionMoveTagSchema),
    primaryTag: counterplanCautionMoveTagSchema,
    adoptionRate: rateSchema,
    opponentUsageRate: rateSchema,
  })
  .strict();

export const counterplanThreatNoteSchema = z
  .object({
    opponentPokemonId: positiveSafeIntegerSchema,
    note: z.string().min(1),
  })
  .strict();

export const counterplanSelectionSchema = z
  .object({
    selectedPokemonIds: z.array(positiveSafeIntegerSchema).min(1).max(6),
    leadPokemonId: positiveSafeIntegerSchema.nullable(),
    assignmentsByOpponent: z
      .array(
        z
          .object({
            opponentPokemonId: positiveSafeIntegerSchema,
            assignedSelfPokemonId: positiveSafeIntegerSchema,
            matchupResult: counterplanMatchupScoreSchema,
          })
          .strict(),
      )
      .min(1)
      .max(6),
    coveredOpponentPokemonIds: z.array(positiveSafeIntegerSchema).max(6),
    uncoveredOpponentPokemonIds: z.array(positiveSafeIntegerSchema).max(6),
    metrics: z
      .object({
        priorityCoveredCount: safeIntegerSchema.nonnegative(),
        coveredCount: safeIntegerSchema.nonnegative(),
        worstBestScore: safeIntegerSchema,
        bestScoreSum: safeIntegerSchema,
        secondBestScoreSum: safeIntegerSchema,
      })
      .strict(),
  })
  .strict();

export const counterplanOpponentRecommendationSchema = z
  .object({
    rank: positiveSafeIntegerSchema,
    selfPokemonId: positiveSafeIntegerSchema,
    opponentPokemonId: positiveSafeIntegerSchema,
    totalScore: scoreSchema,
    classification: matchupVerdictSchema,
    reasonCodes: z.array(matchupReasonCodeSchema),
    matchupResult: counterplanMatchupScoreSchema,
  })
  .strict();

export const counterplanPerOpponentSchema = z
  .object({
    opponentPokemonId: positiveSafeIntegerSchema,
    recommendations: z.array(counterplanOpponentRecommendationSchema).max(3),
    avoidSelfPokemonIds: z.array(positiveSafeIntegerSchema).max(6),
    cautionMoves: z.array(counterplanCautionMoveSchema).max(4),
    threatNotes: z.array(counterplanThreatNoteSchema),
  })
  .strict();

export const counterplanExplanationSchema = z
  .object({
    summary: z.string().min(1),
    selectionExplanation: z.string().min(1),
    perOpponent: z
      .array(
        z
          .object({
            opponentPokemonId: positiveSafeIntegerSchema,
            explanation: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    strategyExplanation: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((explanation, context) => {
    const opponentPokemonIds = explanation.perOpponent.map(
      ({ opponentPokemonId }) => opponentPokemonId,
    );
    if (new Set(opponentPokemonIds).size !== opponentPokemonIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "相手ポケモンIDは重複できません",
        path: ["perOpponent"],
      });
    }
  });

export type CounterplanExplanation = z.infer<typeof counterplanExplanationSchema>;

export const sessionCounterplanResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    selectedArchetypeId: z.string().uuid(),
    perOpponent: z.array(counterplanPerOpponentSchema).min(1).max(6),
    selection: counterplanSelectionSchema,
    playstyleNotes: z.string().nullable(),
    strategyCodes: z.array(counterplanStrategyCodeSchema),
    cautionMoves: z.array(counterplanCautionMoveSchema).max(24),
    threatNotes: z.array(counterplanThreatNoteSchema),
    explanation: counterplanExplanationSchema,
  })
  .strict();

export type SessionCounterplanResponse = z.infer<typeof sessionCounterplanResponseSchema>;
