import type {
  CounterplanResult,
  MatchupReasonCode,
  MatchupScore,
  MatchupVerdict,
  StrategyCode,
} from "@pokemon-champions/matchup";
import {
  COUNTERPLAN_STRATEGY_CODES,
  MATCHUP_REASON_CODES,
  counterplanExplanationSchema,
} from "@pokemon-champions/shared";
import { describe, expect, it, vi } from "vitest";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

const REASON_TEXT = {
  BEST_MOVE_SUPER_EFFECTIVE: "有効な攻撃技で相手の弱点を突けます。",
  BEST_MOVE_RESISTED: "最も有効な攻撃技でも相手に半減されます。",
  BEST_MOVE_IMMUNE: "攻撃技が相手に無効化されます。",
  RESISTS_THREAT: "相手の主な攻撃技を半減できます。",
  IMMUNE_TO_THREAT: "相手の主な攻撃技を無効化できます。",
  TAKES_SUPER_EFFECTIVE_DAMAGE: "相手の主な攻撃技で弱点を突かれます。",
  WINS_DAMAGE_RACE: "確定数の比較では先に倒せます。",
  LOSES_DAMAGE_RACE: "確定数の比較では先に倒されます。",
  EVEN_DAMAGE_RACE: "確定数の比較は互角です。",
  NO_DAMAGING_MOVE: "自分側に有効な攻撃技がありません。",
  OPPONENT_NO_DAMAGING_MOVE: "相手側に有効な攻撃技がありません。",
} as const satisfies Readonly<Record<MatchupReasonCode, string>>;

const STRATEGY_TEXT = {
  PREVENT_SETUP: "積み技を自由に使わせない。",
  LIMIT_HAZARDS: "場に設置する技を警戒する。",
  STALL_SCREEN_TURNS: "壁の残りターンを意識する。",
  RESPECT_PRIORITY: "先制技の圏内に注意する。",
  MANAGE_STATUS: "状態異常を受ける展開を避ける。",
} as const satisfies Readonly<Record<StrategyCode, string>>;

function score(
  selfPokemonId = 1,
  opponentPokemonId = 101,
  classification: MatchupVerdict = "slightly_favorable",
  reasonCodes: readonly MatchupReasonCode[] = ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
): MatchupScore {
  return {
    selfPokemonId,
    myPokemonId: selfPokemonId,
    opponentPokemonId,
    offensiveScore: 25,
    defensiveScore: 20,
    damageRaceScore: 5,
    totalScore: 44,
    classification,
    calculationMode: "full",
    bestOffensiveMoveId: 11,
    mostThreateningMoveId: 21,
    outgoingDamage: null,
    incomingDamage: null,
    outgoingKnockoutCount: 2,
    incomingKnockoutCount: 3,
    offensiveTypeMultiplier: 2,
    defensiveTypeMultiplier: 1,
    reasonCodes: [...reasonCodes],
    score: 44,
    verdict: classification,
    breakdown: {
      offense: 25,
      defense: 20,
      speed: 0,
      damageRace: 5,
      priority: 0,
      statusResist: 0,
      setupCounter: 0,
    },
  };
}

function counterplan(overrides: Partial<CounterplanResult> = {}): CounterplanResult {
  const matchupResult = score();
  const cautionMove = {
    moveId: 21,
    opponentPokemonId: 101,
    tags: ["setup", "status"] as const,
    primaryTag: "setup" as const,
    adoptionRate: 0.9,
    opponentUsageRate: 1,
  };
  const threatNote = { opponentPokemonId: 101, note: "積み展開に注意" };
  return {
    perOpponent: [
      {
        opponentPokemonId: 101,
        recommendations: [
          {
            rank: 1,
            selfPokemonId: 1,
            opponentPokemonId: 101,
            totalScore: 44,
            classification: "slightly_favorable",
            reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
            matchupResult,
          },
        ],
        avoidSelfPokemonIds: [6],
        cautionMoves: [cautionMove],
        threatNotes: [threatNote],
      },
    ],
    selection: {
      selectedPokemonIds: [3, 1, 2],
      leadPokemonId: 1,
      assignmentsByOpponent: [
        {
          opponentPokemonId: 101,
          assignedSelfPokemonId: 1,
          matchupResult,
        },
      ],
      coveredOpponentPokemonIds: [101],
      uncoveredOpponentPokemonIds: [],
      metrics: {
        priorityCoveredCount: 1,
        coveredCount: 1,
        worstBestScore: 44,
        bestScoreSum: 44,
        secondBestScoreSum: 0,
      },
    },
    playstyleNotes: "壁から展開する",
    strategyCodes: ["PREVENT_SETUP", "MANAGE_STATUS"],
    cautionMoves: [cautionMove],
    threatNotes: [threatNote],
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

describe("TemplateExplanationGenerator", () => {
  const generator = new TemplateExplanationGenerator();

  it("同一入力からstrictで同一の出力を返し、入力を変更しない", async () => {
    const input = counterplan();
    const snapshot = structuredClone(input);
    deepFreeze(input);

    const first = await generator.generateCounterplanExplanation(input);
    const second = await generator.generateCounterplanExplanation(input);

    expect(first).toEqual(second);
    expect(counterplanExplanationSchema.parse(first)).toEqual(first);
    expect(input).toEqual(snapshot);
  });

  it.each([
    ["favorable", "この対面は有利です。"],
    ["slightly_favorable", "この対面はやや有利です。"],
    ["even", "この対面は互角です。"],
    ["slightly_unfavorable", "この対面はやや不利です。"],
    ["unfavorable", "この対面は不利です。"],
  ] as const)("%sを決定的な日本語へ変換する", async (classification, expected) => {
    const matchupResult = score(1, 101, classification);
    const input = counterplan({
      perOpponent: [
        {
          ...counterplan().perOpponent[0]!,
          recommendations: [
            {
              rank: 1,
              selfPokemonId: 1,
              opponentPokemonId: 101,
              totalScore: 44,
              classification,
              reasonCodes: matchupResult.reasonCodes,
              matchupResult,
            },
          ],
        },
      ],
    });

    const result = await generator.generateCounterplanExplanation(input);
    expect(result.perOpponent[0]?.explanation).toContain(expected);
  });

  it("全reasonCodesを網羅し、複数コードの順序を維持して重複を除外する", async () => {
    expect(Object.keys(REASON_TEXT)).toEqual([...MATCHUP_REASON_CODES]);
    const reasonCodes = [...MATCHUP_REASON_CODES, "BEST_MOVE_SUPER_EFFECTIVE"] as const;
    const matchupResult = score(1, 101, "even", reasonCodes);
    const input = counterplan({
      perOpponent: [
        {
          ...counterplan().perOpponent[0]!,
          recommendations: [
            {
              rank: 1,
              selfPokemonId: 1,
              opponentPokemonId: 101,
              totalScore: 0,
              classification: "even",
              reasonCodes,
              matchupResult,
            },
          ],
        },
      ],
    });

    const explanation = (await generator.generateCounterplanExplanation(input)).perOpponent[0]!
      .explanation;
    let previousIndex = -1;
    for (const reasonCode of MATCHUP_REASON_CODES) {
      const text = REASON_TEXT[reasonCode];
      expect(explanation.match(new RegExp(text, "gu"))).toHaveLength(1);
      expect(explanation.indexOf(text)).toBeGreaterThan(previousIndex);
      previousIndex = explanation.indexOf(text);
    }
  });

  it("全strategyCodesを固定順で文章化し、0件ならnullにする", async () => {
    expect(Object.keys(STRATEGY_TEXT)).toEqual([...COUNTERPLAN_STRATEGY_CODES]);
    const all = await generator.generateCounterplanExplanation(
      counterplan({ strategyCodes: [...COUNTERPLAN_STRATEGY_CODES].reverse() }),
    );
    expect(all.strategyExplanation).toBe(
      `${COUNTERPLAN_STRATEGY_CODES.map((code) => STRATEGY_TEXT[code]).join(
        "",
      )}登録された立ち回り: 壁から展開する`,
    );

    const empty = await generator.generateCounterplanExplanation(
      counterplan({ strategyCodes: [] }),
    );
    expect(empty.strategyExplanation).toBeNull();
  });

  it("選出・先発・担当・全coverageをIDで説明する", async () => {
    const result = await generator.generateCounterplanExplanation(counterplan());
    expect(result.selectionExplanation).toContain(
      "選出はポケモンID 1、ポケモンID 2、ポケモンID 3です。",
    );
    expect(result.selectionExplanation).toContain("先発はポケモンID 1です。");
    expect(result.selectionExplanation).toContain("全相手に対応可能です。");
    expect(result.selectionExplanation).toContain("担当はポケモンID 101にはポケモンID 1です。");
  });

  it("先発nullとuncoveredを推測せず対象IDで説明する", async () => {
    const base = counterplan();
    const result = await generator.generateCounterplanExplanation(
      counterplan({
        selection: {
          ...base.selection,
          leadPokemonId: null,
          coveredOpponentPokemonIds: [],
          uncoveredOpponentPokemonIds: [101],
        },
      }),
    );
    expect(result.selectionExplanation).toContain("先発は指定されていません。");
    expect(result.selectionExplanation).toContain("未対応の相手はポケモンID 101です。");
    expect(result.selectionExplanation).not.toContain("全相手に対応可能");
  });

  it("rank 1、score内訳、avoid、cautionMove、threatNoteをIDと原文で説明する", async () => {
    const result = await generator.generateCounterplanExplanation(counterplan());
    const explanation = result.perOpponent[0]!.explanation;
    expect(explanation).toContain("ポケモンID 101にはポケモンID 1がおすすめです。");
    expect(explanation).toContain("総合スコアは44です（攻撃25、防御20、確定数比較5）。");
    expect(explanation).toContain("避ける候補はポケモンID 6です。");
    expect(explanation).toContain("警戒技は技ID 21です。");
    expect(explanation).toContain("登録された警戒事項: 積み展開に注意");
  });

  it("avoid・cautionMove・threatNoteが空なら存在しない情報を作らない", async () => {
    const result = await generator.generateCounterplanExplanation(
      counterplan({
        perOpponent: [
          {
            ...counterplan().perOpponent[0]!,
            avoidSelfPokemonIds: [],
            cautionMoves: [],
            threatNotes: [],
          },
        ],
        cautionMoves: [],
        threatNotes: [],
        playstyleNotes: null,
      }),
    );
    const explanation = result.perOpponent[0]!.explanation;
    expect(explanation).not.toContain("避ける候補");
    expect(explanation).not.toContain("警戒技");
    expect(explanation).not.toContain("登録された警戒事項");
    expect(result.strategyExplanation).not.toContain("登録された立ち回り");
  });

  it("名称を推測せずPokemonとMoveをIDで表し、原文をHTMLとして解釈しない", async () => {
    const unsafeText = "<script>alert('x')</script>";
    const base = counterplan();
    const result = await generator.generateCounterplanExplanation(
      counterplan({
        playstyleNotes: unsafeText,
        perOpponent: [
          {
            ...base.perOpponent[0]!,
            threatNotes: [{ opponentPokemonId: 101, note: unsafeText }],
          },
        ],
      }),
    );
    expect(result.selectionExplanation).toContain("ポケモンID 1");
    expect(result.perOpponent[0]?.explanation).toContain(unsafeText);
    expect(result.strategyExplanation).toContain(unsafeText);
  });

  it("Anthropic SDKやHTTPを使わずテンプレ文だけを返す", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(generator.generateCounterplanExplanation(counterplan())).resolves.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rank 1のrecommendationがなければ存在しないおすすめを作らない", async () => {
    const base = counterplan();
    const input = counterplan({
      perOpponent: [{ ...base.perOpponent[0]!, recommendations: [] }],
    });
    await expect(generator.generateCounterplanExplanation(input)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it.each(["classification", "reasonCode", "strategyCode"] as const)(
    "未知の%sを内部不整合として拒否する",
    async (kind) => {
      const input = structuredClone(counterplan()) as CounterplanResult;
      if (kind === "classification") {
        (
          input.perOpponent[0]!.recommendations[0] as {
            classification: string;
          }
        ).classification = "unknown";
      } else if (kind === "reasonCode") {
        (
          input.perOpponent[0]!.recommendations[0] as unknown as {
            reasonCodes: string[];
          }
        ).reasonCodes = ["UNKNOWN"];
      } else {
        (input as unknown as { strategyCodes: string[] }).strategyCodes = ["UNKNOWN"];
      }
      await expect(generator.generateCounterplanExplanation(input)).rejects.toBeInstanceOf(
        RangeError,
      );
    },
  );

  it("長い原文でも切り詰めず決定的に返す", async () => {
    const longNote = "長い警戒事項".repeat(1_000);
    const base = counterplan();
    const input = counterplan({
      playstyleNotes: longNote,
      perOpponent: [
        {
          ...base.perOpponent[0]!,
          threatNotes: [{ opponentPokemonId: 101, note: longNote }],
        },
      ],
    });
    const first = await generator.generateCounterplanExplanation(input);
    const second = await generator.generateCounterplanExplanation(input);
    expect(first).toEqual(second);
    expect(first.perOpponent[0]?.explanation).toContain(longNote);
    expect(first.strategyExplanation).toContain(longNote);
  });
});
