import type { CounterplanResult } from "@pokemon-champions/matchup";
import type { CounterplanExplanation } from "@pokemon-champions/shared";

/** 文章生成実装をNestJSの実行時DIで差し替えるためのtoken。 */
export const EXPLANATION_GENERATOR = Symbol("EXPLANATION_GENERATOR");

/**
 * MATCHUPの確定済み構造を文章化するだけの契約。
 * 実装は入力の順位・選出・スコア・警戒情報を変更してはならない。
 */
export interface ExplanationGenerator {
  generateCounterplanExplanation(input: CounterplanResult): Promise<CounterplanExplanation>;
}
