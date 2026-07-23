import type { CombatantSnapshot, MatchupScore } from "./types";

/**
 * 自ポケモン A vs 相手ポケモン B の1対1相性スコアを計算する(設計書 §9.2〜9.3)。
 * 純粋関数として実装すること。
 *
 * 実装タスク: MATCHUP-002(タイプ相性)/ MATCHUP-003(ダメージ概算)/ MATCHUP-004(1対1スコア)
 */
export function calculateMatchupScore(
  _myPokemon: CombatantSnapshot,
  _opponent: CombatantSnapshot,
): MatchupScore {
  throw new Error("Not implemented yet — MATCHUP-002 以降のタスクで実装する");
}
