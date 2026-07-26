import { describe, expect, it } from "vitest";
import { buildMatchupMatrix, compareMatchupRecommendations } from "./counterplan";
import { calculateMatchupScore } from "./matchup-score";
import type {
  CombatantSnapshot,
  MatchupMatrixCombatant,
  MatchupScore,
  MoveSnapshot,
} from "./types";

function makeMove(moveId: number, type: MoveSnapshot["type"] = "normal", power = 80): MoveSnapshot {
  return {
    moveId,
    type,
    category: "physical",
    power,
    accuracy: 100,
    priority: 0,
    tags: [],
    adoptionRate: 1,
  };
}

function makeCombatant(
  pokemonId: number,
  overrides: Partial<CombatantSnapshot> = {},
): CombatantSnapshot {
  return {
    pokemonId,
    types: ["normal"],
    stats: { hp: 200, atk: 120, def: 100, spa: 120, spd: 100, spe: 100 },
    isMega: false,
    role: null,
    moves: [makeMove(pokemonId * 10)],
    ...overrides,
  };
}

function member(
  pokemonId: number,
  overrides: Partial<CombatantSnapshot> = {},
): MatchupMatrixCombatant {
  return {
    combatant: makeCombatant(pokemonId, overrides),
    level: 50,
  };
}

function makeScore(
  selfPokemonId: number,
  values: Partial<
    Pick<MatchupScore, "totalScore" | "offensiveScore" | "defensiveScore" | "damageRaceScore">
  > = {},
): MatchupScore {
  const totalScore = values.totalScore ?? 0;
  return {
    selfPokemonId,
    myPokemonId: selfPokemonId,
    opponentPokemonId: 100,
    offensiveScore: values.offensiveScore ?? 15,
    defensiveScore: values.defensiveScore ?? 15,
    damageRaceScore: values.damageRaceScore ?? 0,
    totalScore,
    classification: "even",
    bestOffensiveMoveId: null,
    mostThreateningMoveId: null,
    outgoingDamage: null,
    incomingDamage: null,
    outgoingKnockoutCount: null,
    incomingKnockoutCount: null,
    offensiveTypeMultiplier: null,
    defensiveTypeMultiplier: null,
    reasonCodes: ["EVEN_DAMAGE_RACE"],
    score: totalScore,
    verdict: "even",
    breakdown: {
      offense: values.offensiveScore ?? 15,
      defense: values.defensiveScore ?? 15,
      speed: 0,
      damageRace: values.damageRaceScore ?? 0,
      priority: 0,
      statusResist: 0,
      setupCounter: 0,
    },
  };
}

describe("buildMatchupMatrix", () => {
  it("builds one cell for a 1-by-1 input using MATCHUP-004 unchanged", () => {
    const self = member(1, { types: ["fire"], moves: [makeMove(10, "fire", 100)] });
    const opponent = member(2, { types: ["grass"], moves: [makeMove(20, "grass", 100)] });
    const result = buildMatchupMatrix({ self: [self], opponents: [opponent] });

    expect(result.matrix.cells).toHaveLength(1);
    expect(result.matrix.cells[0]).toEqual(
      calculateMatchupScore({
        self: self.combatant,
        selfLevel: self.level,
        opponent: opponent.combatant,
        opponentLevel: opponent.level,
      }),
    );
  });

  it("builds every unique cell for a 2-by-3 input", () => {
    const result = buildMatchupMatrix({
      self: [member(2), member(1)],
      opponents: [member(103), member(101), member(102)],
    });

    expect(result.matrix.selfPokemonIds).toEqual([1, 2]);
    expect(result.matrix.opponentPokemonIds).toEqual([101, 102, 103]);
    expect(result.matrix.cells).toHaveLength(6);
    expect(
      new Set(
        result.matrix.cells.map(
          ({ selfPokemonId, opponentPokemonId }) => `${selfPokemonId}:${opponentPokemonId}`,
        ),
      ).size,
    ).toBe(6);
    expect(
      result.matrix.cells.map(({ selfPokemonId, opponentPokemonId }) => [
        selfPokemonId,
        opponentPokemonId,
      ]),
    ).toEqual([
      [1, 101],
      [1, 102],
      [1, 103],
      [2, 101],
      [2, 102],
      [2, 103],
    ]);
  });

  it("normalizes row and column order independently of input order", () => {
    const self = [member(3), member(1), member(2)];
    const opponents = [member(102), member(101)];

    const forward = buildMatchupMatrix({ self, opponents });
    const reversed = buildMatchupMatrix({
      self: [...self].reverse(),
      opponents: [...opponents].reverse(),
    });

    expect(reversed).toEqual(forward);
  });

  it("does not treat A-versus-B as B-versus-A", () => {
    const fire = member(1, { types: ["fire"], moves: [makeMove(10, "fire", 100)] });
    const grass = member(2, { types: ["grass"], moves: [makeMove(20, "grass", 40)] });

    const forward = buildMatchupMatrix({ self: [fire], opponents: [grass] }).matrix.cells[0];
    const reverse = buildMatchupMatrix({ self: [grass], opponents: [fire] }).matrix.cells[0];

    expect(forward?.totalScore).not.toBe(reverse?.totalScore);
  });

  it("returns a fresh result without mutating inputs or retaining prior result mutations", () => {
    const self = [member(2), member(1)];
    const opponents = [member(101)];
    const before = structuredClone({ self, opponents });
    const first = buildMatchupMatrix({ self, opponents });

    (first.matrix.cells as MatchupScore[]).splice(0, 1);
    (first.perOpponent[0]?.recommendations[0]?.reasonCodes as string[] | undefined)?.push(
      "changed",
    );
    const second = buildMatchupMatrix({ self, opponents });

    expect({ self, opponents }).toEqual(before);
    expect(second.matrix.cells).toHaveLength(2);
    expect(second.perOpponent[0]?.recommendations[0]?.reasonCodes).not.toContain("changed");
  });

  it("is independent of move array order", () => {
    const moves = [makeMove(10, "normal", 70), makeMove(11, "fire", 80)];
    const self = member(1, { moves });
    const opponent = member(2, { types: ["grass"] });

    const forward = buildMatchupMatrix({ self: [self], opponents: [opponent] });
    const reversed = buildMatchupMatrix({
      self: [{ ...self, combatant: { ...self.combatant, moves: [...moves].reverse() } }],
      opponents: [opponent],
    });

    expect(reversed).toEqual(forward);
  });
});

describe("opponent recommendations", () => {
  it("returns up to three ranked recommendations and the exact corresponding cells", () => {
    const result = buildMatchupMatrix({
      self: [member(4), member(1), member(3), member(2)],
      opponents: [member(100)],
    });
    const recommendation = result.perOpponent[0];

    expect(recommendation?.recommendations).toHaveLength(3);
    for (const ranked of recommendation?.recommendations ?? []) {
      expect(ranked.rank).toBeGreaterThanOrEqual(1);
      expect(ranked.recommendedSelfPokemonId).toBe(ranked.myPokemonId);
      expect(ranked.matchupResult).toBe(
        result.matrix.cells.find(
          (cell) =>
            cell.selfPokemonId === ranked.myPokemonId &&
            cell.opponentPokemonId === recommendation?.opponentPokemonId,
        ),
      );
      expect(ranked.score).toBe(ranked.matchupResult.totalScore);
      expect(ranked.reasonCodes).toEqual(ranked.matchupResult.reasonCodes);
    }
    expect(result.recommendationsByOpponent).toBe(result.perOpponent);
  });

  it("still recommends the least unfavorable Pokemon when every result is unfavorable", () => {
    const self = [
      member(1, { stats: { hp: 60, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 } }),
      member(2, { stats: { hp: 80, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 } }),
    ];
    const opponent = member(100, {
      types: ["fighting"],
      stats: { hp: 500, atk: 500, def: 500, spa: 500, spd: 500, spe: 500 },
      moves: [makeMove(1000, "fighting", 200)],
    });
    const result = buildMatchupMatrix({ self, opponents: [opponent] });
    const cells = result.matrix.cells;
    const recommendation = result.perOpponent[0];

    expect(cells.every(({ totalScore }) => totalScore < 0)).toBe(true);
    expect(recommendation?.recommendations).toHaveLength(2);
    expect(recommendation?.recommendations[0]?.score).toBe(
      Math.max(...cells.map(({ totalScore }) => totalScore)),
    );
  });

  it("can choose a different best Pokemon for each opponent", () => {
    const result = buildMatchupMatrix({
      self: [
        member(1, { types: ["fire"], moves: [makeMove(10, "fire", 100)] }),
        member(2, { types: ["water"], moves: [makeMove(20, "water", 100)] }),
      ],
      opponents: [
        member(101, { types: ["grass"], moves: [makeMove(1010, "grass", 80)] }),
        member(102, { types: ["fire"], moves: [makeMove(1020, "fire", 80)] }),
      ],
    });

    expect(result.perOpponent.map((entry) => entry.recommendations[0]?.myPokemonId)).toEqual([
      1, 2,
    ]);
  });

  it("marks only MATCHUP-004 unfavorable cells as avoid candidates", () => {
    const result = buildMatchupMatrix({
      self: [
        member(1, {
          types: ["normal"],
          stats: { hp: 30, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
        }),
        member(2, {
          types: ["ghost"],
          moves: [makeMove(20, "ghost", 120)],
        }),
      ],
      opponents: [
        member(100, {
          types: ["fighting"],
          stats: { hp: 500, atk: 500, def: 500, spa: 500, spd: 500, spe: 500 },
          moves: [makeMove(1000, "fighting", 200)],
        }),
      ],
    });
    const expected = result.matrix.cells
      .filter(({ classification }) => classification === "unfavorable")
      .map(({ selfPokemonId }) => selfPokemonId)
      .sort((left, right) => left - right);

    expect(result.perOpponent[0]?.avoidMyPokemonIds).toEqual(expected);
  });
});

describe("compareMatchupRecommendations", () => {
  it("uses total, offense, defense, damage race, then Pokemon ID as tie-breakers", () => {
    expect(
      [makeScore(1, { totalScore: 9 }), makeScore(2, { totalScore: 10 })].sort(
        compareMatchupRecommendations,
      )[0]?.selfPokemonId,
    ).toBe(2);
    expect(
      [makeScore(1, { offensiveScore: 20 }), makeScore(2, { offensiveScore: 21 })].sort(
        compareMatchupRecommendations,
      )[0]?.selfPokemonId,
    ).toBe(2);
    expect(
      [makeScore(1, { defensiveScore: 20 }), makeScore(2, { defensiveScore: 21 })].sort(
        compareMatchupRecommendations,
      )[0]?.selfPokemonId,
    ).toBe(2);
    expect(
      [makeScore(1, { damageRaceScore: 5 }), makeScore(2, { damageRaceScore: 10 })].sort(
        compareMatchupRecommendations,
      )[0]?.selfPokemonId,
    ).toBe(2);
    expect([makeScore(2), makeScore(1)].sort(compareMatchupRecommendations)[0]?.selfPokemonId).toBe(
      1,
    );
  });
});

describe("buildMatchupMatrix input validation", () => {
  it.each([
    [{ self: [], opponents: [member(100)] }, /self must contain at least one/],
    [{ self: [member(1)], opponents: [] }, /opponents must contain at least one/],
    [{ self: [member(1), member(1)], opponents: [member(100)] }, /self must not contain duplicate/],
    [
      { self: [member(1)], opponents: [member(100), member(100)] },
      /opponents must not contain duplicate/,
    ],
    [{ self: [member(0)], opponents: [member(100)] }, /pokemonId must be a positive safe integer/],
    [
      { self: [{ ...member(1), level: Number.NaN }], opponents: [member(100)] },
      /level must be a positive safe integer/,
    ],
    [
      { self: [{ ...member(1), level: Number.POSITIVE_INFINITY }], opponents: [member(100)] },
      /level must be a positive safe integer/,
    ],
    [
      { self: [{ ...member(1), level: 50.5 }], opponents: [member(100)] },
      /level must be a positive safe integer/,
    ],
    [
      { self: [{ ...member(1), level: 101 }], opponents: [member(100)] },
      /level must be between 1 and 100/,
    ],
  ])("rejects invalid matrix input %#", (input, message) => {
    expect(() => buildMatchupMatrix(input)).toThrowError(message);
  });

  it("rejects more than six combatants on either side", () => {
    const seven = Array.from({ length: 7 }, (_, index) => member(index + 1));
    expect(() => buildMatchupMatrix({ self: seven, opponents: [member(100)] })).toThrowError(
      /self must contain at most 6/,
    );
    expect(() =>
      buildMatchupMatrix({
        self: [member(1)],
        opponents: seven.map((entry, index) => ({
          ...entry,
          combatant: { ...entry.combatant, pokemonId: index + 100 },
        })),
      }),
    ).toThrowError(/opponents must contain at most 6/);
  });

  it("delegates invalid stats, types, and duplicate move IDs to MATCHUP-004 validation", () => {
    expect(() =>
      buildMatchupMatrix({
        self: [
          member(1, {
            stats: { hp: 0, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
          }),
        ],
        opponents: [member(100)],
      }),
    ).toThrowError(/stats\.hp/);
    expect(() =>
      buildMatchupMatrix({
        self: [member(1, { types: ["fire", "fire"] })],
        opponents: [member(100)],
      }),
    ).toThrowError();
    expect(() =>
      buildMatchupMatrix({
        self: [member(1, { moves: [makeMove(10), makeMove(10)] })],
        opponents: [member(100)],
      }),
    ).toThrowError(/duplicate moveId/);
  });
});
