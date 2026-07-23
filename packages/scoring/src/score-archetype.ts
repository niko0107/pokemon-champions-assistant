import type { ArchetypeSnapshot, ObservationInput, ScoredCandidate, ScoringConfig } from "./types";
import { DEFAULT_SCORING_CONFIG } from "./config";

/**
 * 1つのテンプレ構築を観測列に対してスコアリングする(設計書 §7.2・§7.5)。
 *
 * 純粋関数として実装すること: 同じ入力に対して常に同じ出力を返し、副作用を持たない。
 *
 * 実装タスク: SCORE-002(ポケモン一致)/ SCORE-003(技一致)/ SCORE-004(矛盾・除外)
 */
export function scoreArchetype(
  _archetype: ArchetypeSnapshot,
  _observations: readonly ObservationInput[],
  _config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredCandidate {
  throw new Error("Not implemented yet — SCORE-002 以降のタスクで実装する");
}
