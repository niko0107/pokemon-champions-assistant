import { describe, expect, it } from "vitest";
import { calculateMatchupScore } from "./matchup-score";
import { buildCounterplan } from "./counterplan";
import type { CombatantSnapshot } from "./types";

/**
 * 相性判定エンジンのテスト雛形。
 * ロジック実装タスク(MATCHUP-002〜007)で it.todo を実テストに置き換える。
 * テストケースは設計書 §9 に基づく。
 */

const dummyCombatant: CombatantSnapshot = {
  pokemonId: 1,
  types: ["water"],
  stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  isMega: false,
  role: null,
  moves: [],
};

describe("calculateMatchupScore (MATCHUP-002〜004 で実装)", () => {
  it.todo("弱点を突ける技を持つ場合、攻撃相性(0〜30)を加点する");
  it.todo("相手の想定技を半減/無効にできる場合、防御相性(0〜30)を加点する");
  it.todo("素早さ実数値の比較で −10〜+15 を加減点する(スカーフ補正込み)");
  it.todo("簡易ダメージ計算による確定数比較で −15〜+15 を加減点する");
  it.todo("有効な先制技を持つ場合 +5 する");
  it.todo("相手が積み技持ちで対抗手段がない場合に減点する");
  it.todo("合計を −100〜+100 に正規化し verdict(有利/五分/不利)を判定する");
  it.todo("相手の技が観測済みならその技、未観測なら採用率上位4技で計算する");

  it("未実装のうちは明示的にエラーを投げる", () => {
    expect(() => calculateMatchupScore(dummyCombatant, dummyCombatant)).toThrowError(
      /Not implemented/,
    );
  });
});

describe("buildCounterplan (MATCHUP-005〜007 で実装)", () => {
  it.todo("自6体 × 相手6体の相性マトリクス(36セル)を計算する");
  it.todo("相手のエース級への回答が最低1体含まれる選出を提案する");
  it.todo("先発は相手の default_leads に最も有利なポケモンを選ぶ");
  it.todo("警戒技として setup/hazard/screen/priority/status タグの技を列挙する");

  it("未実装のうちは明示的にエラーを投げる", () => {
    expect(() =>
      buildCounterplan(
        { partyId: "p1", pokemons: [] },
        { archetypeId: "a1", defaultLeadSlots: [], pokemons: [] },
      ),
    ).toThrowError(/Not implemented/);
  });
});
