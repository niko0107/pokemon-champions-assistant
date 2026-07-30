import { describe, expect, it } from "vitest";
import { COUNTERPLAN_STRATEGY_CODES, MATCHUP_REASON_CODES, MATCHUP_VERDICTS } from "../matchup";
import {
  sessionCounterplanExplanationStatusResponseSchema,
  sessionCounterplanParamsSchema,
  sessionCounterplanResponseSchema,
} from "./session-counterplan";

const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const selectedArchetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

function matchupResult() {
  return {
    selfPokemonId: 1,
    myPokemonId: 1,
    opponentPokemonId: 101,
    offensiveScore: 25,
    defensiveScore: 20,
    damageRaceScore: 5,
    totalScore: 44,
    classification: "slightly_favorable",
    calculationMode: "full",
    bestOffensiveMoveId: 11,
    mostThreateningMoveId: 21,
    outgoingDamage: {
      moveId: 11,
      category: "special",
      minDamage: 80,
      maxDamage: 80,
      minDamagePercent: 52.63,
      maxDamagePercent: 52.63,
      typeMultiplier: 2,
      stabMultiplier: 1.5,
      attackerStat: 150,
      defenderStat: 120,
      canDamage: true,
      isImmune: false,
      knockoutCount: 2,
      possibleKnockoutCount: 2,
      knockoutClassification: "guaranteed_two_hit",
    },
    incomingDamage: null,
    outgoingKnockoutCount: 2,
    incomingKnockoutCount: null,
    offensiveTypeMultiplier: 2,
    defensiveTypeMultiplier: null,
    reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
    score: 44,
    verdict: "slightly_favorable",
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

function validResponse() {
  const result = matchupResult();
  const cautionMove = {
    moveId: 21,
    opponentPokemonId: 101,
    tags: ["setup", "status"],
    primaryTag: "setup",
    adoptionRate: 1,
    opponentUsageRate: 0.8,
  };
  const threatNote = {
    opponentPokemonId: 101,
    note: "積み展開に注意",
  };
  return {
    sessionId,
    selectedArchetypeId,
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
            matchupResult: result,
          },
        ],
        avoidSelfPokemonIds: [6],
        cautionMoves: [cautionMove],
        threatNotes: [threatNote],
      },
    ],
    selection: {
      selectedPokemonIds: [1, 2, 3],
      leadPokemonId: 1,
      assignmentsByOpponent: [
        {
          opponentPokemonId: 101,
          assignedSelfPokemonId: 1,
          matchupResult: result,
        },
      ],
      coveredOpponentPokemonIds: [101],
      uncoveredOpponentPokemonIds: [],
      metrics: {
        priorityCoveredCount: 1,
        coveredCount: 1,
        worstBestScore: 44,
        bestScoreSum: 44,
        secondBestScoreSum: 10,
      },
    },
    playstyleNotes: "壁から展開する",
    strategyCodes: ["PREVENT_SETUP", "MANAGE_STATUS"],
    cautionMoves: [cautionMove],
    threatNotes: [threatNote],
    explanation: {
      summary: "相手ポケモン1体への対策です。",
      selectionExplanation: "選出はポケモンID 1、ポケモンID 2、ポケモンID 3です。",
      perOpponent: [
        {
          opponentPokemonId: 101,
          explanation: "ポケモンID 101にはポケモンID 1がおすすめです。",
        },
      ],
      strategyExplanation: "積み技を自由に使わせない。",
    },
  };
}

describe("sessionCounterplanParamsSchema", () => {
  it("Session UUIDだけをstrictに受理する", () => {
    expect(sessionCounterplanParamsSchema.parse({ id: sessionId })).toEqual({ id: sessionId });
    expect(sessionCounterplanParamsSchema.safeParse({ id: "invalid" }).success).toBe(false);
    expect(
      sessionCounterplanParamsSchema.safeParse({ id: sessionId, userId: sessionId }).success,
    ).toBe(false);
  });
});

describe("sessionCounterplanResponseSchema", () => {
  it("MATCHUP-007の構造化結果とselectionをstrictに受理する", () => {
    const parsed = sessionCounterplanResponseSchema.parse(validResponse());

    expect(parsed.perOpponent[0]?.recommendations[0]).toMatchObject({
      classification: "slightly_favorable",
      reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
    });
    expect(parsed.strategyCodes).toEqual(["PREVENT_SETUP", "MANAGE_STATUS"]);
    expect(parsed.cautionMoves[0]).toMatchObject({ moveId: 21, primaryTag: "setup" });
    expect(parsed.threatNotes).toEqual([{ opponentPokemonId: 101, note: "積み展開に注意" }]);
    expect(parsed.selection.selectedPokemonIds).toEqual([1, 2, 3]);
    expect(parsed.explanation).toMatchObject({
      summary: "相手ポケモン1体への対策です。",
      strategyExplanation: "積み技を自由に使わせない。",
    });
  });

  it("classification・reasonCodes・strategyCodesの全literalと整合する", () => {
    for (const verdict of MATCHUP_VERDICTS) {
      const input = validResponse();
      input.perOpponent[0]!.recommendations[0]!.classification = verdict;
      input.perOpponent[0]!.recommendations[0]!.matchupResult.classification = verdict;
      input.perOpponent[0]!.recommendations[0]!.matchupResult.verdict = verdict;
      expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(true);
    }
    for (const reasonCode of MATCHUP_REASON_CODES) {
      const input = validResponse();
      input.perOpponent[0]!.recommendations[0]!.reasonCodes = [reasonCode];
      input.perOpponent[0]!.recommendations[0]!.matchupResult.reasonCodes = [reasonCode];
      expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(true);
    }
    for (const strategyCode of COUNTERPLAN_STRATEGY_CODES) {
      const input = validResponse();
      input.strategyCodes = [strategyCode];
      expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(true);
    }
  });

  it("type_onlyではダメージ・確定数をstrictに返さない", () => {
    const input = validResponse();
    const result = input.perOpponent[0]!.recommendations[0]!.matchupResult;
    Object.assign(result, {
      calculationMode: "type_only",
      damageRaceScore: 0,
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
      reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE"],
      breakdown: { ...result.breakdown, damageRace: 0, speed: 0 },
    });
    input.selection.assignmentsByOpponent[0]!.matchupResult = result;
    expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(true);

    result.outgoingKnockoutCount = 2;
    expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(false);

    Object.assign(result, { outgoingKnockoutCount: null });
    result.breakdown.speed = 1;
    expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(false);

    result.breakdown.speed = 0;
    result.reasonCodes = ["WINS_DAMAGE_RACE"];
    expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(false);
  });

  it("トップレベルとネストした余分なキーを拒否する", () => {
    expect(
      sessionCounterplanResponseSchema.safeParse({ ...validResponse(), userId: sessionId }).success,
    ).toBe(false);

    const nested = validResponse();
    Object.assign(nested.selection, { createdAt: "2026-07-27T00:00:00.000Z" });
    expect(sessionCounterplanResponseSchema.safeParse(nested).success).toBe(false);

    const explanation = validResponse();
    Object.assign(explanation.explanation, { provider: "internal" });
    expect(sessionCounterplanResponseSchema.safeParse(explanation).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "有限でない数値%sを拒否する",
    (value) => {
      const score = validResponse();
      score.perOpponent[0]!.recommendations[0]!.totalScore = value;
      expect(sessionCounterplanResponseSchema.safeParse(score).success).toBe(false);

      const rate = validResponse();
      rate.cautionMoves[0]!.adoptionRate = value;
      expect(sessionCounterplanResponseSchema.safeParse(rate).success).toBe(false);
    },
  );

  it("未知のclassification・reasonCode・strategyCodeを拒否する", () => {
    const input = validResponse();
    input.perOpponent[0]!.recommendations[0]!.classification = "unknown" as "slightly_favorable";
    input.perOpponent[0]!.recommendations[0]!.reasonCodes = [
      "UNKNOWN" as "BEST_MOVE_SUPER_EFFECTIVE",
    ];
    input.strategyCodes = ["UNKNOWN" as "PREVENT_SETUP"];
    expect(sessionCounterplanResponseSchema.safeParse(input).success).toBe(false);
  });
});

describe("sessionCounterplanExplanationStatusResponseSchema", () => {
  it("readyだけstrictな説明を受理する", () => {
    const explanation = validResponse().explanation;
    expect(
      sessionCounterplanExplanationStatusResponseSchema.parse({
        status: "ready",
        explanation,
      }),
    ).toEqual({ status: "ready", explanation });
  });

  it.each(["pending", "failed", "unavailable"] as const)(
    "%sはexplanation=nullだけを受理する",
    (status) => {
      expect(
        sessionCounterplanExplanationStatusResponseSchema.parse({
          status,
          explanation: null,
        }),
      ).toEqual({ status, explanation: null });
      expect(
        sessionCounterplanExplanationStatusResponseSchema.safeParse({
          status,
          explanation: validResponse().explanation,
        }).success,
      ).toBe(false);
    },
  );

  it("内部情報と余分なキーを全状態で拒否する", () => {
    for (const extra of [
      { cacheKey: "secret" },
      { provider: "anthropic" },
      { failureReason: "rate_limit" },
    ]) {
      expect(
        sessionCounterplanExplanationStatusResponseSchema.safeParse({
          status: "pending",
          explanation: null,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});
