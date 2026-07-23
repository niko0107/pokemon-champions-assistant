import type { CounterplanResult, MyPartySnapshot, PredictedTeamSnapshot } from "./types";

/**
 * 相性マトリクス(6×6)からおすすめ選出・警戒技を算出する(設計書 §9.4〜9.5)。
 * 純粋関数として実装すること。
 *
 * 実装タスク: MATCHUP-005(マトリクス)/ MATCHUP-006(選出提案)/ MATCHUP-007(警戒技)
 */
export function buildCounterplan(
  _myParty: MyPartySnapshot,
  _predictedTeam: PredictedTeamSnapshot,
): CounterplanResult {
  throw new Error("Not implemented yet — MATCHUP-005 以降のタスクで実装する");
}
