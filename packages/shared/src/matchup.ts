import { z } from "zod";

export const MATCHUP_VERDICTS = [
  "favorable",
  "slightly_favorable",
  "even",
  "slightly_unfavorable",
  "unfavorable",
] as const;

export const MATCHUP_CALCULATION_MODES = ["full", "type_only"] as const;

export const MATCHUP_REASON_CODES = [
  "BEST_MOVE_SUPER_EFFECTIVE",
  "BEST_MOVE_RESISTED",
  "BEST_MOVE_IMMUNE",
  "RESISTS_THREAT",
  "IMMUNE_TO_THREAT",
  "TAKES_SUPER_EFFECTIVE_DAMAGE",
  "WINS_DAMAGE_RACE",
  "LOSES_DAMAGE_RACE",
  "EVEN_DAMAGE_RACE",
  "NO_DAMAGING_MOVE",
  "OPPONENT_NO_DAMAGING_MOVE",
] as const;

export const KNOCKOUT_CLASSIFICATIONS = [
  "guaranteed_one_hit",
  "possible_one_hit",
  "guaranteed_two_hit",
  "possible_two_hit",
  "guaranteed_three_plus_hits",
  "possible_three_plus_hits",
  "cannot_ko",
] as const;

export const COUNTERPLAN_CAUTION_MOVE_TAGS = [
  "setup",
  "hazard",
  "screen",
  "priority",
  "status",
] as const;

export const COUNTERPLAN_STRATEGY_CODES = [
  "PREVENT_SETUP",
  "LIMIT_HAZARDS",
  "STALL_SCREEN_TURNS",
  "RESPECT_PRIORITY",
  "MANAGE_STATUS",
] as const;

export const matchupVerdictSchema = z.enum(MATCHUP_VERDICTS);
export const matchupCalculationModeSchema = z.enum(MATCHUP_CALCULATION_MODES);
export const matchupReasonCodeSchema = z.enum(MATCHUP_REASON_CODES);
export const knockoutClassificationSchema = z.enum(KNOCKOUT_CLASSIFICATIONS);
export const counterplanCautionMoveTagSchema = z.enum(COUNTERPLAN_CAUTION_MOVE_TAGS);
export const counterplanStrategyCodeSchema = z.enum(COUNTERPLAN_STRATEGY_CODES);

export type MatchupVerdictValue = z.infer<typeof matchupVerdictSchema>;
export type MatchupCalculationModeValue = z.infer<typeof matchupCalculationModeSchema>;
export type MatchupReasonCodeValue = z.infer<typeof matchupReasonCodeSchema>;
export type KnockoutClassificationValue = z.infer<typeof knockoutClassificationSchema>;
export type CounterplanCautionMoveTagValue = z.infer<typeof counterplanCautionMoveTagSchema>;
export type CounterplanStrategyCodeValue = z.infer<typeof counterplanStrategyCodeSchema>;
