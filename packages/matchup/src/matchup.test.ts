import { describe, expect, it } from "vitest";
import { calculateDamageRange } from "./damage-estimation";
import { calculateMatchupScore } from "./matchup-score";
import { buildCounterplan, buildMatchupMatrix, buildSelectionRecommendation } from "./counterplan";
import { getCombinedTypeEffectiveness, getDefensiveTypeProfile } from "./type-effectiveness";
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

describe("calculateMatchupScore (MATCHUP-002〜004)", () => {
  it("MATCHUP-002: 弱点を突ける攻撃タイプを判定する", () => {
    expect(
      getCombinedTypeEffectiveness("electric", {
        type1: "water",
        type2: "flying",
      }),
    ).toBe(4);
  });

  it("MATCHUP-002: 相手の攻撃タイプを半減・無効にできる防御相性を分類する", () => {
    const profile = getDefensiveTypeProfile({ type1: "ground", type2: "flying" });
    expect(profile.resistances).toContain("fighting");
    expect(profile.immunities).toEqual(["electric", "ground"]);
  });

  it("承認済み対象外の素早さ値をスコアへ加えない", () => {
    const baseStats = dummyCombatant.stats;
    if (baseStats === null) throw new Error("test fixture must have stats");
    const slow = { ...dummyCombatant, pokemonId: 1, stats: { ...baseStats, spe: 1 } };
    const fast = { ...dummyCombatant, pokemonId: 2, stats: { ...baseStats, spe: 999 } };
    expect(
      calculateMatchupScore({
        self: slow,
        selfLevel: 50,
        opponent: fast,
        opponentLevel: 50,
      }).breakdown.speed,
    ).toBe(0);
  });
  it("MATCHUP-003: 簡易ダメージ計算から確定数を算出する", () => {
    const result = calculateDamageRange({
      attacker: {
        pokemonId: 1,
        level: 50,
        attack: 120,
        specialAttack: 100,
        type1: "fire",
        type2: null,
      },
      defender: {
        pokemonId: 2,
        hp: 200,
        defense: 100,
        specialDefense: 100,
        type1: "grass",
        type2: null,
      },
      move: {
        moveId: 1,
        type: "fire",
        category: "physical",
        power: 100,
      },
    });

    expect(result.minDamage).toBe(162);
    expect(result.knockoutCount).toBe(2);
    expect(result.knockoutClassification).toBe("guaranteed_two_hit");
  });
  it("承認済み対象外の先制技・積み対応軸をスコアへ加えない", () => {
    const result = calculateMatchupScore({
      self: dummyCombatant,
      selfLevel: 50,
      opponent: dummyCombatant,
      opponentLevel: 50,
    });
    expect(result.breakdown.priority).toBe(0);
    expect(result.breakdown.setupCounter).toBe(0);
  });

  it("合計を −100〜+100 に正規化し判定する", () => {
    const result = calculateMatchupScore({
      self: dummyCombatant,
      selfLevel: 50,
      opponent: { ...dummyCombatant, pokemonId: 2 },
      opponentLevel: 50,
    });
    expect(result.totalScore).toBeGreaterThanOrEqual(-100);
    expect(result.totalScore).toBeLessThanOrEqual(100);
    expect(result.classification).toBe("even");
  });

  it("呼び出し側が選択した相手技配列だけを評価する", () => {
    const opponent = {
      ...dummyCombatant,
      pokemonId: 2,
      moves: [
        {
          moveId: 10,
          type: "normal" as const,
          category: "physical" as const,
          power: 20,
          accuracy: 100,
          priority: 0,
          tags: [],
          adoptionRate: 1,
        },
        {
          moveId: 20,
          type: "normal" as const,
          category: "physical" as const,
          power: 200,
          accuracy: 100,
          priority: 0,
          tags: [],
          adoptionRate: 0.01,
        },
      ],
    };
    const result = calculateMatchupScore({
      self: dummyCombatant,
      selfLevel: 50,
      opponent,
      opponentLevel: 50,
    });
    expect(result.mostThreateningMoveId).toBe(20);
  });
});

describe("buildCounterplan (MATCHUP-005〜007 で実装)", () => {
  it("MATCHUP-005: 自6体 × 相手6体の相性マトリクス(36セル)を計算する", () => {
    const self = Array.from({ length: 6 }, (_, index) => ({
      combatant: { ...dummyCombatant, pokemonId: index + 1 },
      level: 50,
    }));
    const opponents = Array.from({ length: 6 }, (_, index) => ({
      combatant: { ...dummyCombatant, pokemonId: index + 101 },
      level: 50,
    }));

    expect(buildMatchupMatrix({ self, opponents }).matrix.cells).toHaveLength(36);
  });
  it("MATCHUP-006: 呼び出し側がpriority指定した相手への回答を含む選出を返す", () => {
    const matrix = buildMatchupMatrix({
      self: [
        { combatant: { ...dummyCombatant, pokemonId: 2 }, level: 50 },
        { combatant: { ...dummyCombatant, pokemonId: 1 }, level: 50 },
      ],
      opponents: [{ combatant: { ...dummyCombatant, pokemonId: 101 }, level: 50 }],
    });

    const result = buildSelectionRecommendation({
      matrix,
      pickSize: 1,
      priorityOpponentPokemonIds: [101],
    });

    expect(result.selectedPokemonIds).toEqual([1]);
    expect(result.coveredOpponentPokemonIds).toEqual([101]);
  });

  it("MATCHUP-006: priority対象との比較から選出内の先発を決める", () => {
    const matrix = buildMatchupMatrix({
      self: [
        { combatant: { ...dummyCombatant, pokemonId: 2 }, level: 50 },
        { combatant: { ...dummyCombatant, pokemonId: 1 }, level: 50 },
      ],
      opponents: [{ combatant: { ...dummyCombatant, pokemonId: 101 }, level: 50 }],
    });

    const result = buildSelectionRecommendation({
      matrix,
      pickSize: 2,
      priorityOpponentPokemonIds: [101],
    });

    expect(result.leadPokemonId).toBe(1);
  });
  it("MATCHUP-007: setup/hazard/screen/priority/statusタグを構造化して列挙する", () => {
    const matrix = buildMatchupMatrix({
      self: [{ combatant: dummyCombatant, level: 50 }],
      opponents: [{ combatant: { ...dummyCombatant, pokemonId: 101 }, level: 50 }],
    });
    const selection = buildSelectionRecommendation({ matrix, pickSize: 1 });
    const result = buildCounterplan({
      archetype: {
        playstyleNotes: "展開を急がない",
        pokemons: [
          {
            pokemonId: 101,
            usageRate: 1,
            threatNotes: "積み技に注意",
            moves: [
              {
                moveId: 1001,
                tags: ["setup", "status"],
                adoptionRate: 1,
              },
            ],
          },
        ],
      },
      matrix,
      selection,
    });

    expect(result.cautionMoves).toEqual([
      {
        moveId: 1001,
        opponentPokemonId: 101,
        tags: ["setup", "status"],
        primaryTag: "setup",
        adoptionRate: 1,
        opponentUsageRate: 1,
      },
    ]);
    expect(result.strategyCodes).toEqual(["PREVENT_SETUP", "MANAGE_STATUS"]);
  });
});
