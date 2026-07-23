import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_CONFIG } from "./config";

/**
 * 一致度計算のテスト雛形。
 * ロジック実装タスク(SCORE-002〜005)で it.todo を実テストに置き換える。
 * テストケースは設計書 §7 および 付録A の具体例に基づく。
 */
describe("DEFAULT_SCORING_CONFIG", () => {
  it("設計書 付録B の初期値と一致する", () => {
    expect(DEFAULT_SCORING_CONFIG.pokemonHit).toBe(10);
    expect(DEFAULT_SCORING_CONFIG.moveHit).toBe(15);
    expect(DEFAULT_SCORING_CONFIG.itemHit).toBe(15);
    expect(DEFAULT_SCORING_CONFIG.pokemonMiss).toBe(20);
    expect(DEFAULT_SCORING_CONFIG.excludeMissCount).toBe(3);
  });
});

describe("scoreArchetype (SCORE-002〜004 で実装)", () => {
  it.todo("観測ポケモンが構築に存在する場合 +pokemonHit × usageRate 加点する");
  it.todo("観測技がそのポケモンの技リストにある場合 +moveHit × adoptionRate 加点する");
  it.todo("先発位置が default_leads と一致する場合 +leadHit 加点する");
  it.todo("観測ポケモンが構築に存在しない場合 -pokemonMiss 減点する");
  it.todo("構築のそのポケモンにない技を観測した場合 -moveConflict 減点する");
  it.todo("is_revoked な観測(Undo 済み)は計算対象外とする");
  it.todo("match_rate = clamp(raw/max, 0, 1) × 100 で正規化する");
  it.todo("raw_score が負の場合は一致度 0% とする");
  it.todo("ポケモン不一致3体以上で excluded=true とする");
  it.todo("メガ矛盾が発生した場合 excluded=true とする");
  it.todo("付録A の具体例(カバルドン先発+ステロ+ドラパルト+リフレクター)で一致度 89% になる");

  it("未実装のうちは明示的にエラーを投げる", async () => {
    const { scoreArchetype } = await import("./score-archetype");
    expect(() =>
      scoreArchetype(
        {
          id: "a1",
          name: "test",
          popularityTier: "high",
          encounterCount: 0,
          defaultLeadSlots: [],
          updatedAt: "2026-01-01T00:00:00Z",
          pokemons: [],
        },
        [],
      ),
    ).toThrowError(/Not implemented/);
  });
});

describe("rankCandidates (SCORE-005 で実装)", () => {
  it.todo("一致度 → 人気度 → 遭遇報告数 → 更新日 の優先順でソートする");
  it.todo("excluded な候補を除外する");
  it.todo("上位 limit 件のみ返し rank を付与する");
});
