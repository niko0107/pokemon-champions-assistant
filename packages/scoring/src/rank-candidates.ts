import type { ArchetypeSnapshot, RankedCandidate, ScoredCandidate } from "./types";

/**
 * スコア済み候補を設計書 §7.3 の優先順位でソートし、上位 N 件を返す。
 *   1. 一致度 DESC → 2. 人気度(high→mid→low)→ 3. 遭遇報告数 DESC → 4. 更新日 DESC
 * excluded な候補は除外する。
 *
 * 実装タスク: SCORE-005(人気度を含む並び替え)
 */
export function rankCandidates(
  _candidates: readonly ScoredCandidate[],
  _archetypes: ReadonlyMap<string, ArchetypeSnapshot>,
  _limit: number,
): RankedCandidate[] {
  throw new Error("Not implemented yet — SCORE-005 で実装する");
}
