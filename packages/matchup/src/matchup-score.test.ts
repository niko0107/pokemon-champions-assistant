import { describe, expect, it } from "vitest";
import {
  calculateDamageRaceScore,
  calculateMatchupScore,
  classifyMatchupScore,
  normalizeMatchupScore,
  scoreDefensiveTypeMultiplier,
  scoreOffensiveTypeMultiplier,
} from "./matchup-score";
import type {
  CombatantSnapshot,
  MatchupScoreInput,
  MoveSnapshot,
  TypeEffectivenessMultiplier,
} from "./types";

function makeMove(
  moveId: number,
  type: MoveSnapshot["type"],
  category: MoveSnapshot["category"] = "physical",
  power: number | null = category === "status" ? null : 80,
): MoveSnapshot {
  return {
    moveId,
    type,
    category,
    power,
    accuracy: 100,
    priority: 0,
    tags: [],
    adoptionRate: 1,
  };
}

function makeCombatant(
  pokemonId: number,
  moves: MoveSnapshot[],
  overrides: Partial<CombatantSnapshot> = {},
): CombatantSnapshot {
  return {
    pokemonId,
    types: ["normal"],
    stats: { hp: 200, atk: 120, def: 100, spa: 120, spd: 100, spe: 100 },
    isMega: false,
    role: null,
    moves,
    ...overrides,
  };
}

function makeInput(
  self: CombatantSnapshot,
  opponent: CombatantSnapshot,
  levels: { selfLevel?: number; opponentLevel?: number } = {},
): MatchupScoreInput {
  return {
    self,
    selfLevel: levels.selfLevel ?? 50,
    opponent,
    opponentLevel: levels.opponentLevel ?? 50,
  };
}

describe("MATCHUP-004 score tables", () => {
  it.each<[TypeEffectivenessMultiplier, number]>([
    [0, 0],
    [0.25, 5],
    [0.5, 10],
    [1, 15],
    [2, 25],
    [4, 30],
  ])("maps offensive multiplier %s to %s", (multiplier, score) => {
    expect(scoreOffensiveTypeMultiplier(multiplier)).toBe(score);
  });

  it.each<[TypeEffectivenessMultiplier, number]>([
    [0, 30],
    [0.25, 25],
    [0.5, 20],
    [1, 15],
    [2, 5],
    [4, 0],
  ])("maps defensive multiplier %s to %s", (multiplier, score) => {
    expect(scoreDefensiveTypeMultiplier(multiplier)).toBe(score);
  });

  it.each([
    [2, 5, 15],
    [2, 4, 10],
    [2, 3, 5],
    [2, 2, 0],
    [3, 2, -5],
    [4, 2, -10],
    [5, 2, -15],
  ])("maps outgoing=%s and incoming=%s turns to race score %s", (outgoing, incoming, score) => {
    expect(calculateDamageRaceScore(outgoing, incoming)).toBe(score);
  });

  it("handles either or both sides being unable to knock out", () => {
    expect(calculateDamageRaceScore(2, null)).toBe(15);
    expect(calculateDamageRaceScore(null, 2)).toBe(-15);
    expect(calculateDamageRaceScore(null, null)).toBe(0);
  });

  it("normalizes and clamps the approved score range", () => {
    expect(normalizeMatchupScore(30, 30, 15)).toBe(100);
    expect(normalizeMatchupScore(0, 0, -15)).toBe(-100);
    expect(normalizeMatchupScore(15, 15, 0)).toBe(0);
  });

  it.each([
    [50, "favorable"],
    [49, "slightly_favorable"],
    [10, "slightly_favorable"],
    [9, "even"],
    [-9, "even"],
    [-10, "slightly_unfavorable"],
    [-49, "slightly_unfavorable"],
    [-50, "unfavorable"],
  ] as const)("classifies boundary %s as %s", (score, classification) => {
    expect(classifyMatchupScore(score)).toBe(classification);
  });
});

describe("calculateMatchupScore", () => {
  it("selects the move with the fewest knockout turns", () => {
    const self = makeCombatant(1, [
      makeMove(10, "normal", "physical", 40),
      makeMove(20, "normal", "physical", 120),
    ]);
    const opponent = makeCombatant(2, [makeMove(30, "normal")], {
      stats: { hp: 120, atk: 100, def: 80, spa: 100, spd: 80, spe: 100 },
    });

    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result.bestOffensiveMoveId).toBe(20);
    expect(result.outgoingKnockoutCount).toBeLessThan(
      calculateMatchupScore(
        makeInput(makeCombatant(1, [makeMove(10, "normal", "physical", 40)]), opponent),
      ).outgoingKnockoutCount ?? Number.POSITIVE_INFINITY,
    );
  });

  it("uses lower moveId as the final tie-break for both directions", () => {
    const self = makeCombatant(1, [
      makeMove(20, "normal", "physical", 80),
      makeMove(10, "normal", "physical", 80),
    ]);
    const opponent = makeCombatant(2, [
      makeMove(40, "normal", "special", 80),
      makeMove(30, "normal", "special", 80),
    ]);

    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result.bestOffensiveMoveId).toBe(10);
    expect(result.mostThreateningMoveId).toBe(30);
  });

  it("uses larger damage before type multiplier and moveId when turns tie", () => {
    const self = makeCombatant(1, [
      makeMove(10, "normal", "physical", 80),
      makeMove(20, "normal", "physical", 90),
    ]);
    const opponent = makeCombatant(2, []);

    expect(calculateMatchupScore(makeInput(self, opponent)).bestOffensiveMoveId).toBe(20);
  });

  it("uses larger type multiplier before moveId when turns and damage tie", () => {
    const self = makeCombatant(1, [
      makeMove(10, "normal", "physical", 80),
      makeMove(20, "fire", "physical", 60),
    ]);
    const opponent = makeCombatant(2, [], { types: ["grass"] });
    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result.outgoingDamage?.maxDamage).toBe(66);
    expect(result.bestOffensiveMoveId).toBe(20);
    expect(result.offensiveTypeMultiplier).toBe(2);
  });

  it("is independent of move array order", () => {
    const selfMoves = [
      makeMove(1, "water", "special", 80),
      makeMove(2, "ice", "special", 90),
      makeMove(3, "normal", "physical", 120),
    ];
    const opponentMoves = [
      makeMove(4, "grass", "special", 80),
      makeMove(5, "normal", "physical", 100),
    ];
    const self = makeCombatant(1, selfMoves, { types: ["water"] });
    const opponent = makeCombatant(2, opponentMoves, { types: ["grass", "flying"] });

    const forward = calculateMatchupScore(makeInput(self, opponent));
    const reversed = calculateMatchupScore(
      makeInput(
        { ...self, moves: [...selfMoves].reverse() },
        { ...opponent, moves: [...opponentMoves].reverse() },
      ),
    );

    expect(reversed).toEqual(forward);
  });

  it("excludes status, null-power status, and immune zero-damage moves", () => {
    const self = makeCombatant(
      1,
      [makeMove(1, "normal", "status", null), makeMove(2, "electric", "special", 100)],
      { types: ["electric"] },
    );
    const opponent = makeCombatant(2, [], { types: ["ground"] });

    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result.bestOffensiveMoveId).toBeNull();
    expect(result.offensiveScore).toBe(0);
    expect(result.offensiveTypeMultiplier).toBeNull();
    expect(result.reasonCodes).toContain("BEST_MOVE_IMMUNE");
    expect(result.reasonCodes).toContain("NO_DAMAGING_MOVE");
  });

  it("excludes unsupported null-power damaging moves instead of inventing damage", () => {
    const self = makeCombatant(1, [makeMove(1, "normal", "physical", null)]);
    const result = calculateMatchupScore(makeInput(self, makeCombatant(2, [])));

    expect(result.bestOffensiveMoveId).toBeNull();
    expect(result.outgoingDamage).toBeNull();
    expect(result.reasonCodes).toContain("NO_DAMAGING_MOVE");
  });

  it("returns the approved defaults when neither side has a damaging move", () => {
    const result = calculateMatchupScore(
      makeInput(makeCombatant(1, [makeMove(1, "normal", "status", null)]), makeCombatant(2, [])),
    );

    expect(result).toMatchObject({
      selfPokemonId: 1,
      opponentPokemonId: 2,
      offensiveScore: 0,
      defensiveScore: 30,
      damageRaceScore: 0,
      totalScore: 0,
      classification: "even",
      bestOffensiveMoveId: null,
      mostThreateningMoveId: null,
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
      offensiveTypeMultiplier: null,
      defensiveTypeMultiplier: null,
    });
    expect(result.reasonCodes).toEqual([
      "NO_DAMAGING_MOVE",
      "OPPONENT_NO_DAMAGING_MOVE",
      "EVEN_DAMAGE_RACE",
    ]);
  });

  it("handles only self being unable to deal damage", () => {
    const result = calculateMatchupScore(
      makeInput(makeCombatant(1, []), makeCombatant(2, [makeMove(2, "normal")])),
    );

    expect(result.offensiveScore).toBe(0);
    expect(result.damageRaceScore).toBe(-15);
    expect(result.reasonCodes).toContain("LOSES_DAMAGE_RACE");
  });

  it("handles only the opponent being unable to deal damage", () => {
    const result = calculateMatchupScore(
      makeInput(makeCombatant(1, [makeMove(1, "normal")]), makeCombatant(2, [])),
    );

    expect(result.defensiveScore).toBe(30);
    expect(result.damageRaceScore).toBe(15);
    expect(result.reasonCodes).toContain("WINS_DAMAGE_RACE");
  });

  it("reports structured offense, defense, damage, and reason fields", () => {
    const self = makeCombatant(1, [makeMove(1, "fire", "special", 100)], {
      types: ["fire", "rock"],
    });
    const opponent = makeCombatant(2, [makeMove(2, "water", "special", 100)], {
      types: ["grass"],
    });

    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result.offensiveScore).toBe(25);
    expect(result.defensiveScore).toBe(0);
    expect(result.offensiveTypeMultiplier).toBe(2);
    expect(result.defensiveTypeMultiplier).toBe(4);
    expect(result.outgoingDamage?.moveId).toBe(1);
    expect(result.incomingDamage?.moveId).toBe(2);
    expect(result.reasonCodes).toContain("BEST_MOVE_SUPER_EFFECTIVE");
    expect(result.reasonCodes).toContain("TAKES_SUPER_EFFECTIVE_DAMAGE");
    expect(result.myPokemonId).toBe(result.selfPokemonId);
    expect(result.score).toBe(result.totalScore);
    expect(result.verdict).toBe(result.classification);
    expect(result.calculationMode).toBe("full");
  });

  it("実数値不足時はタイプ相性だけを評価しダメージ・確定数を生成しない", () => {
    const self = makeCombatant(1, [makeMove(1, "fire", "special", 100)], {
      types: ["fire"],
    });
    const opponent = makeCombatant(2, [makeMove(2, "water", "special", 100)], {
      types: ["grass"],
      stats: null,
    });

    const result = calculateMatchupScore(makeInput(self, opponent));

    expect(result).toMatchObject({
      calculationMode: "type_only",
      offensiveScore: 25,
      defensiveScore: 5,
      damageRaceScore: 0,
      bestOffensiveMoveId: 1,
      mostThreateningMoveId: 2,
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
    });
    expect(result.reasonCodes).toEqual([
      "BEST_MOVE_SUPER_EFFECTIVE",
      "TAKES_SUPER_EFFECTIVE_DAMAGE",
    ]);
    expect(result.reasonCodes).not.toContain("EVEN_DAMAGE_RACE");
    expect(result.breakdown.speed).toBe(0);
  });

  it("unclassifiedのpartial相手を具体roleへ推測せず同じtype_only評価にする", () => {
    const self = makeCombatant(1, [makeMove(1, "fire", "special", 100)], {
      types: ["fire"],
    });
    const unclassified = makeCombatant(2, [makeMove(2, "water", "special", 100)], {
      types: ["grass"],
      stats: null,
      role: "unclassified",
    });
    const concrete = { ...unclassified, role: "sweeper" as const };
    const input = makeInput(self, unclassified);
    const before = structuredClone(input);

    const result = calculateMatchupScore(input);

    expect(result).toEqual(calculateMatchupScore(makeInput(self, concrete)));
    expect(result).toMatchObject({
      calculationMode: "type_only",
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
      breakdown: { speed: 0, damageRace: 0 },
    });
    expect(input).toEqual(before);
  });

  it("produces asymmetric results when combatants are swapped", () => {
    const fire = makeCombatant(1, [makeMove(1, "fire", "special", 120)], {
      types: ["fire"],
      stats: { hp: 180, atk: 80, def: 80, spa: 150, spd: 80, spe: 100 },
    });
    const grass = makeCombatant(2, [makeMove(2, "grass", "physical", 40)], {
      types: ["grass"],
      stats: { hp: 240, atk: 70, def: 110, spa: 70, spd: 110, spe: 80 },
    });

    const fireIntoGrass = calculateMatchupScore(makeInput(fire, grass));
    const grassIntoFire = calculateMatchupScore(makeInput(grass, fire));

    expect(fireIntoGrass.totalScore).not.toBe(grassIntoFire.totalScore);
    expect(fireIntoGrass.bestOffensiveMoveId).toBe(1);
    expect(grassIntoFire.bestOffensiveMoveId).toBe(2);
  });

  it("does not mutate input snapshots", () => {
    const input = makeInput(
      makeCombatant(1, [makeMove(2, "water"), makeMove(1, "normal")]),
      makeCombatant(2, [makeMove(3, "grass")]),
    );
    const before = structuredClone(input);

    calculateMatchupScore(input);

    expect(input).toEqual(before);
  });

  it.each([
    ["selfLevel", 0],
    ["selfLevel", 101],
    ["selfLevel", 1.5],
    ["opponentLevel", 0],
    ["opponentLevel", 101],
  ] as const)("rejects invalid %s=%s", (field, value) => {
    const input = makeInput(makeCombatant(1, []), makeCombatant(2, []));
    expect(() => calculateMatchupScore({ ...input, [field]: value })).toThrow(RangeError);
  });

  it("rejects invalid Pokemon IDs, stats, types, and duplicate move IDs", () => {
    const opponent = makeCombatant(2, []);

    expect(() => calculateMatchupScore(makeInput(makeCombatant(0, []), opponent))).toThrow(
      RangeError,
    );
    expect(() =>
      calculateMatchupScore(
        makeInput(
          makeCombatant(1, [], {
            stats: { hp: 200, atk: 0, def: 100, spa: 100, spd: 100, spe: 100 },
          }),
          opponent,
        ),
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateMatchupScore(makeInput(makeCombatant(1, [], { types: ["fire", "fire"] }), opponent)),
    ).toThrow(RangeError);
    expect(() =>
      calculateMatchupScore(
        makeInput(makeCombatant(1, [makeMove(1, "normal"), makeMove(1, "fire")]), opponent),
      ),
    ).toThrow(RangeError);
  });

  it("rejects invalid move categories and powers", () => {
    const opponent = makeCombatant(2, []);
    const invalidCategory = makeMove(1, "normal");
    const invalidPower = makeMove(2, "normal", "physical", -1);

    expect(() =>
      calculateMatchupScore(
        makeInput(
          makeCombatant(1, [
            { ...invalidCategory, category: "invalid" as MoveSnapshot["category"] },
          ]),
          opponent,
        ),
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateMatchupScore(makeInput(makeCombatant(1, [invalidPower]), opponent)),
    ).toThrow(RangeError);
  });
});
