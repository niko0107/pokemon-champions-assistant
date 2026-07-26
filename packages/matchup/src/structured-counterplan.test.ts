import { describe, expect, it } from "vitest";
import { buildCounterplan, buildSelectionRecommendation } from "./counterplan";
import type {
  CounterplanArchetypePokemonSnapshot,
  CounterplanArchetypeSnapshot,
  CounterplanInput,
  MatchupMatrixResult,
  MatchupScore,
  MatchupVerdict,
  SelectionRecommendation,
} from "./types";

function classify(totalScore: number): MatchupVerdict {
  if (totalScore >= 50) return "favorable";
  if (totalScore >= 10) return "slightly_favorable";
  if (totalScore >= -9) return "even";
  if (totalScore >= -49) return "slightly_unfavorable";
  return "unfavorable";
}

function makeScore(
  selfPokemonId: number,
  opponentPokemonId: number,
  totalScore: number,
  overrides: Partial<
    Pick<MatchupScore, "offensiveScore" | "defensiveScore" | "damageRaceScore">
  > = {},
): MatchupScore {
  const offensiveScore = overrides.offensiveScore ?? 15;
  const defensiveScore = overrides.defensiveScore ?? 15;
  const damageRaceScore = overrides.damageRaceScore ?? 0;
  const classification = classify(totalScore);
  return {
    selfPokemonId,
    myPokemonId: selfPokemonId,
    opponentPokemonId,
    offensiveScore,
    defensiveScore,
    damageRaceScore,
    totalScore,
    classification,
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
    verdict: classification,
    breakdown: {
      offense: offensiveScore,
      defense: defensiveScore,
      speed: 0,
      damageRace: damageRaceScore,
      priority: 0,
      statusResist: 0,
      setupCounter: 0,
    },
  };
}

function makeMatrix(
  selfPokemonIds: readonly number[],
  opponentPokemonIds: readonly number[],
  scoreFactory: (selfPokemonId: number, opponentPokemonId: number) => MatchupScore,
): MatchupMatrixResult {
  const cells = selfPokemonIds.flatMap((selfPokemonId) =>
    opponentPokemonIds.map((opponentPokemonId) => scoreFactory(selfPokemonId, opponentPokemonId)),
  );
  return {
    matrix: {
      selfPokemonIds: [...selfPokemonIds],
      opponentPokemonIds: [...opponentPokemonIds],
      cells,
      scores: cells,
    },
    perOpponent: [],
    recommendationsByOpponent: [],
  };
}

function pokemon(
  pokemonId: number,
  overrides: Partial<CounterplanArchetypePokemonSnapshot> = {},
): CounterplanArchetypePokemonSnapshot {
  return {
    pokemonId,
    usageRate: 1,
    threatNotes: null,
    moves: [],
    ...overrides,
  };
}

function makeArchetype(
  pokemons: readonly CounterplanArchetypePokemonSnapshot[],
  playstyleNotes: string | null = "展開を急がずに戦う",
): CounterplanArchetypeSnapshot {
  return { pokemons, playstyleNotes };
}

function makeInput(
  archetype: CounterplanArchetypeSnapshot,
  matrix: MatchupMatrixResult,
  selection?: SelectionRecommendation,
): CounterplanInput {
  return {
    archetype,
    matrix,
    selection:
      selection ??
      buildSelectionRecommendation({
        matrix,
        pickSize: Math.min(2, matrix.matrix.selfPokemonIds.length),
      }),
  };
}

const baseMatrix = makeMatrix([1, 2, 3, 4], [101, 102], (selfPokemonId, opponentPokemonId) => {
  const scores: Record<string, number> = {
    "1:101": 50,
    "2:101": 20,
    "3:101": -10,
    "4:101": -50,
    "1:102": -10,
    "2:102": 50,
    "3:102": 20,
    "4:102": -100,
  };
  return makeScore(
    selfPokemonId,
    opponentPokemonId,
    scores[`${selfPokemonId}:${opponentPokemonId}`]!,
  );
});

const baseArchetype = makeArchetype([
  pokemon(101, {
    usageRate: 0.9,
    threatNotes: "積み展開に注意",
    moves: [
      { moveId: 1001, tags: ["setup"], adoptionRate: 0.8 },
      { moveId: 1002, tags: ["pivot"], adoptionRate: 1 },
    ],
  }),
  pokemon(102, {
    usageRate: 0.7,
    threatNotes: "状態異常に注意",
    moves: [{ moveId: 1003, tags: ["status"], adoptionRate: 0.6 }],
  }),
]);

describe("buildCounterplan: 警戒技", () => {
  it("setup / hazard / screen / priority / statusを抽出し、pivot単独を除外する", () => {
    const archetype = makeArchetype([
      pokemon(101, {
        moves: [
          { moveId: 1, tags: ["setup"], adoptionRate: 1 },
          { moveId: 2, tags: ["hazard"], adoptionRate: 1 },
          { moveId: 3, tags: ["screen"], adoptionRate: 1 },
          { moveId: 4, tags: ["priority"], adoptionRate: 1 },
          { moveId: 5, tags: ["status"], adoptionRate: 1 },
          { moveId: 6, tags: ["pivot"], adoptionRate: 1 },
        ],
      }),
      pokemon(102),
    ]);

    const result = buildCounterplan(makeInput(archetype, baseMatrix));
    expect(result.cautionMoves.map(({ moveId }) => moveId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("複数タグでは承認済み優先順でtagsを保持しprimaryTagを決める", () => {
    const archetype = makeArchetype([
      pokemon(101, {
        moves: [
          {
            moveId: 1,
            tags: ["status", "pivot", "priority", "setup"],
            adoptionRate: 1,
          },
        ],
      }),
      pokemon(102),
    ]);

    expect(buildCounterplan(makeInput(archetype, baseMatrix)).cautionMoves[0]).toMatchObject({
      moveId: 1,
      tags: ["setup", "priority", "status"],
      primaryTag: "setup",
    });
  });

  it("primaryTag、adoptionRate、usageRate、Pokemon ID、Move IDの順で並べる", () => {
    const archetype = makeArchetype([
      pokemon(102, {
        usageRate: 0.8,
        moves: [
          { moveId: 20, tags: ["setup"], adoptionRate: 0.7 },
          { moveId: 10, tags: ["setup"], adoptionRate: 0.7 },
        ],
      }),
      pokemon(101, {
        usageRate: 0.9,
        moves: [
          { moveId: 40, tags: ["hazard"], adoptionRate: 1 },
          { moveId: 30, tags: ["setup"], adoptionRate: 0.7 },
          { moveId: 50, tags: ["setup"], adoptionRate: 0.9 },
        ],
      }),
    ]);

    expect(
      buildCounterplan(makeInput(archetype, baseMatrix)).cautionMoves.map(
        ({ opponentPokemonId, moveId }) => [opponentPokemonId, moveId],
      ),
    ).toEqual([
      [101, 50],
      [101, 30],
      [102, 10],
      [102, 20],
      [101, 40],
    ]);
  });

  it("同一Moveを別Pokemonが持つ場合も関連を維持して重複排除しない", () => {
    const archetype = makeArchetype([
      pokemon(101, {
        moves: [{ moveId: 1, tags: ["setup"], adoptionRate: 1 }],
      }),
      pokemon(102, {
        moves: [{ moveId: 1, tags: ["setup"], adoptionRate: 1 }],
      }),
    ]);

    expect(
      buildCounterplan(makeInput(archetype, baseMatrix)).cautionMoves.map(
        ({ opponentPokemonId, moveId }) => ({ opponentPokemonId, moveId }),
      ),
    ).toEqual([
      { opponentPokemonId: 101, moveId: 1 },
      { opponentPokemonId: 102, moveId: 1 },
    ]);
  });

  it("対象タグの技がなければ空配列を返す", () => {
    const archetype = makeArchetype([
      pokemon(101, {
        moves: [{ moveId: 1, tags: ["pivot"], adoptionRate: 1 }],
      }),
      pokemon(102),
    ]);

    expect(buildCounterplan(makeInput(archetype, baseMatrix)).cautionMoves).toEqual([]);
  });
});

describe("buildCounterplan: threatNotes / strategyCodes / playstyleNotes", () => {
  it("空白noteを除外し、usageRate、Pokemon ID、note順で決定的に返す", () => {
    const archetype = makeArchetype([
      pokemon(102, { usageRate: 0.8, threatNotes: "B" }),
      pokemon(101, { usageRate: 0.8, threatNotes: "A" }),
    ]);
    const matrix = makeMatrix([1], [101, 102], (selfPokemonId, opponentPokemonId) =>
      makeScore(selfPokemonId, opponentPokemonId, 0),
    );
    const result = buildCounterplan(makeInput(archetype, matrix));

    expect(result.threatNotes).toEqual([
      { opponentPokemonId: 101, note: "A" },
      { opponentPokemonId: 102, note: "B" },
    ]);

    const blank = makeArchetype([
      pokemon(101, { threatNotes: "   " }),
      pokemon(102, { threatNotes: "" }),
    ]);
    expect(buildCounterplan(makeInput(blank, matrix)).threatNotes).toEqual([]);
  });

  it("同じnote文字列でもPokemonとの関連が異なるため両方保持する", () => {
    const archetype = makeArchetype([
      pokemon(101, { threatNotes: "同じ注意点" }),
      pokemon(102, { threatNotes: "同じ注意点" }),
    ]);

    expect(buildCounterplan(makeInput(archetype, baseMatrix)).threatNotes).toEqual([
      { opponentPokemonId: 101, note: "同じ注意点" },
      { opponentPokemonId: 102, note: "同じ注意点" },
    ]);
  });

  it("note内容をMove IDやstrategyCodeへ推測変換しない", () => {
    const archetype = makeArchetype([
      pokemon(101, { threatNotes: "ステルスロックと積み技に注意" }),
      pokemon(102),
    ]);
    const result = buildCounterplan(makeInput(archetype, baseMatrix));

    expect(result.threatNotes).toEqual([
      { opponentPokemonId: 101, note: "ステルスロックと積み技に注意" },
    ]);
    expect(result.cautionMoves).toEqual([]);
    expect(result.strategyCodes).toEqual([]);
  });

  it("警戒タグを承認済み順序のstrategyCodesへ重複なしで変換する", () => {
    const archetype = makeArchetype([
      pokemon(101, {
        moves: [
          { moveId: 1, tags: ["status", "setup"], adoptionRate: 1 },
          { moveId: 2, tags: ["hazard", "setup"], adoptionRate: 1 },
        ],
      }),
      pokemon(102, {
        moves: [
          { moveId: 3, tags: ["screen"], adoptionRate: 1 },
          { moveId: 4, tags: ["priority"], adoptionRate: 1 },
        ],
      }),
    ]);

    expect(buildCounterplan(makeInput(archetype, baseMatrix)).strategyCodes).toEqual([
      "PREVENT_SETUP",
      "LIMIT_HAZARDS",
      "STALL_SCREEN_TURNS",
      "RESPECT_PRIORITY",
      "MANAGE_STATUS",
    ]);
  });

  it("playstyleNotesは非空なら加工せず、空白だけならnullにする", () => {
    const preserved = "  壁から展開する  ";
    expect(
      buildCounterplan(makeInput(makeArchetype(baseArchetype.pokemons, preserved), baseMatrix))
        .playstyleNotes,
    ).toBe(preserved);
    expect(
      buildCounterplan(makeInput(makeArchetype(baseArchetype.pokemons, "  "), baseMatrix))
        .playstyleNotes,
    ).toBeNull();
  });
});

describe("buildCounterplan: perOpponent / avoid / selection", () => {
  it("既存比較順で相手ごとの上位3件をrank付きで返しreasonCodesを保持する", () => {
    const matrix = makeMatrix([1, 2, 3, 4], [101], (selfPokemonId, opponentPokemonId) => {
      const values: Record<
        number,
        {
          totalScore: number;
          offensiveScore: number;
          defensiveScore: number;
          damageRaceScore: number;
        }
      > = {
        1: { totalScore: 20, offensiveScore: 10, defensiveScore: 15, damageRaceScore: 0 },
        2: { totalScore: 20, offensiveScore: 20, defensiveScore: 15, damageRaceScore: 0 },
        3: { totalScore: 20, offensiveScore: 20, defensiveScore: 20, damageRaceScore: 0 },
        4: { totalScore: 20, offensiveScore: 20, defensiveScore: 20, damageRaceScore: 5 },
      };
      const value = values[selfPokemonId]!;
      return makeScore(selfPokemonId, opponentPokemonId, value.totalScore, value);
    });
    const archetype = makeArchetype([pokemon(101)]);
    const result = buildCounterplan(makeInput(archetype, matrix));
    const recommendations = result.perOpponent[0]?.recommendations ?? [];

    expect(recommendations.map(({ rank, selfPokemonId }) => [rank, selfPokemonId])).toEqual([
      [1, 4],
      [2, 3],
      [3, 2],
    ]);
    expect(recommendations[0]?.reasonCodes).toEqual(["EVEN_DAMAGE_RACE"]);
    expect(recommendations[0]?.matchupResult).toEqual(matrix.matrix.cells[3]);
  });

  it("unfavorableだけをtotalScore昇順、Pokemon ID昇順でavoidへ含める", () => {
    const matrix = makeMatrix([1, 2, 3, 4], [101], (selfPokemonId, opponentPokemonId) => {
      const totals: Record<number, number> = { 1: -50, 2: -10, 3: -100, 4: -50 };
      return makeScore(selfPokemonId, opponentPokemonId, totals[selfPokemonId]!);
    });
    const result = buildCounterplan(makeInput(makeArchetype([pokemon(101)]), matrix));

    expect(result.perOpponent[0]?.avoidSelfPokemonIds).toEqual([3, 1, 4]);
    expect(result.perOpponent[0]?.avoidSelfPokemonIds).not.toContain(2);
  });

  it("cautionMovesとthreatNotesを相手Pokemonへ紐付ける", () => {
    const result = buildCounterplan(makeInput(baseArchetype, baseMatrix));
    expect(result.perOpponent[0]?.cautionMoves.map(({ moveId }) => moveId)).toEqual([1001]);
    expect(result.perOpponent[0]?.threatNotes).toEqual([
      { opponentPokemonId: 101, note: "積み展開に注意" },
    ]);
    expect(result.perOpponent[1]?.cautionMoves.map(({ moveId }) => moveId)).toEqual([1003]);
  });

  it("SelectionRecommendationを再計算せず値を維持し、ace/backを追加しない", () => {
    const selection = buildSelectionRecommendation({
      matrix: baseMatrix,
      pickSize: 2,
      priorityOpponentPokemonIds: [101],
    });
    const result = buildCounterplan(makeInput(baseArchetype, baseMatrix, selection));

    expect(result.selection).toEqual(selection);
    expect(result.selection.leadPokemonId).not.toBeNull();
    expect(result.selection.uncoveredOpponentPokemonIds).toEqual(
      selection.uncoveredOpponentPokemonIds,
    );
    expect(result).not.toHaveProperty("teamPlan");
    expect(result.selection).not.toHaveProperty("acePokemonId");
    expect(result.selection).not.toHaveProperty("backPokemonId");
  });

  it("priorityなしのlead=nullをそのまま保持する", () => {
    const selection = buildSelectionRecommendation({
      matrix: baseMatrix,
      pickSize: 2,
    });
    expect(
      buildCounterplan(makeInput(baseArchetype, baseMatrix, selection)).selection.leadPokemonId,
    ).toBeNull();
  });
});

describe("buildCounterplan: 決定性・非破壊性", () => {
  it("Pokemon・Move・matrix cell順を変えても同じ結果を返す", () => {
    const forwardInput = makeInput(baseArchetype, baseMatrix);
    const reversedArchetype = {
      ...baseArchetype,
      pokemons: [...baseArchetype.pokemons]
        .reverse()
        .map((entry) => ({ ...entry, moves: [...entry.moves].reverse() })),
    };
    const reversedMatrix: MatchupMatrixResult = {
      ...baseMatrix,
      matrix: {
        ...baseMatrix.matrix,
        selfPokemonIds: [...baseMatrix.matrix.selfPokemonIds].reverse(),
        opponentPokemonIds: [...baseMatrix.matrix.opponentPokemonIds].reverse(),
        cells: [...baseMatrix.matrix.cells].reverse(),
        scores: [...baseMatrix.matrix.scores].reverse(),
      },
    };
    const reorderedInput = makeInput(reversedArchetype, reversedMatrix, forwardInput.selection);

    expect(buildCounterplan(reorderedInput)).toEqual(buildCounterplan(forwardInput));
  });

  it("入力を変更せず、同一入力では同じ結果を返す", () => {
    const input = makeInput(baseArchetype, baseMatrix);
    const before = structuredClone(input);

    expect(buildCounterplan(input)).toEqual(buildCounterplan(input));
    expect(input).toEqual(before);
  });

  it("返却値の変更で入力や次回結果を壊さない", () => {
    const input = makeInput(baseArchetype, baseMatrix);
    const expected = buildCounterplan(input);
    const result = buildCounterplan(input);

    (result.cautionMoves[0] as unknown as { moveId: number }).moveId = 999;
    (result.strategyCodes as string[]).push("MUTATED");
    (result.selection.selectedPokemonIds as number[])[0] = 999;
    (result.perOpponent[0]?.recommendations[0]?.matchupResult.reasonCodes as string[]).push(
      "MUTATED",
    );

    expect(buildCounterplan(input)).toEqual(expected);
    expect(
      input.archetype.pokemons.some((entry) => entry.moves.some((move) => move.moveId === 999)),
    ).toBe(false);
    expect(input.selection.selectedPokemonIds).not.toContain(999);
  });
});

describe("buildCounterplan: 不正入力", () => {
  it("archetypeのPokemon ID重複と同一Pokemon内Move ID重複を拒否する", () => {
    const duplicatePokemon = makeArchetype([pokemon(101), pokemon(101)]);
    const duplicateMove = makeArchetype([
      pokemon(101, {
        moves: [
          { moveId: 1, tags: ["setup"], adoptionRate: 1 },
          { moveId: 1, tags: ["status"], adoptionRate: 0.5 },
        ],
      }),
      pokemon(102),
    ]);

    expect(() => buildCounterplan(makeInput(duplicatePokemon, baseMatrix))).toThrow(RangeError);
    expect(() => buildCounterplan(makeInput(duplicateMove, baseMatrix))).toThrow(RangeError);
  });

  it("matrixとarchetypeの相手ID不一致を拒否する", () => {
    expect(() =>
      buildCounterplan(makeInput(makeArchetype([pokemon(101), pokemon(999)]), baseMatrix)),
    ).toThrow(RangeError);
  });

  it("selectionの自分ID・assignment不足/重複・lead不整合を拒否する", () => {
    const selection = buildSelectionRecommendation({ matrix: baseMatrix, pickSize: 2 });
    const unknownSelected = {
      ...selection,
      selectedPokemonIds: [1, 999],
    };
    const missingAssignment = {
      ...selection,
      assignmentsByOpponent: selection.assignmentsByOpponent.slice(1),
    };
    const duplicateAssignment = {
      ...selection,
      assignmentsByOpponent: [
        selection.assignmentsByOpponent[0]!,
        selection.assignmentsByOpponent[0]!,
      ],
    };
    const invalidLead = { ...selection, leadPokemonId: 999 };

    for (const invalid of [unknownSelected, missingAssignment, duplicateAssignment, invalidLead]) {
      expect(() => buildCounterplan(makeInput(baseArchetype, baseMatrix, invalid))).toThrow(
        RangeError,
      );
    }
  });

  it("cell不足と不正MatchupResultを拒否する", () => {
    const missingCells = {
      ...baseMatrix,
      matrix: {
        ...baseMatrix.matrix,
        cells: baseMatrix.matrix.cells.slice(1),
      },
    };
    const invalidCells = [...baseMatrix.matrix.cells];
    invalidCells[0] = {
      ...invalidCells[0]!,
      totalScore: Number.NaN,
      score: Number.NaN,
    };
    const invalidMatrix = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, cells: invalidCells },
    };

    expect(() =>
      buildCounterplan({
        archetype: baseArchetype,
        matrix: missingCells,
        selection: makeInput(baseArchetype, baseMatrix).selection,
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildCounterplan({
        archetype: baseArchetype,
        matrix: invalidMatrix,
        selection: makeInput(baseArchetype, baseMatrix).selection,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    [
      "Move ID 0",
      makeArchetype([
        pokemon(101, { moves: [{ moveId: 0, tags: [], adoptionRate: 1 }] }),
        pokemon(102),
      ]),
    ],
    [
      "不正tag",
      makeArchetype([
        pokemon(101, { moves: [{ moveId: 1, tags: ["unknown" as "setup"], adoptionRate: 1 }] }),
        pokemon(102),
      ]),
    ],
    [
      "重複tag",
      makeArchetype([
        pokemon(101, { moves: [{ moveId: 1, tags: ["setup", "setup"], adoptionRate: 1 }] }),
        pokemon(102),
      ]),
    ],
    ["usageRate負数", makeArchetype([pokemon(101, { usageRate: -0.1 }), pokemon(102)])],
    ["usageRate NaN", makeArchetype([pokemon(101, { usageRate: Number.NaN }), pokemon(102)])],
    [
      "adoptionRate超過",
      makeArchetype([
        pokemon(101, { moves: [{ moveId: 1, tags: [], adoptionRate: 1.1 }] }),
        pokemon(102),
      ]),
    ],
    [
      "adoptionRate Infinity",
      makeArchetype([
        pokemon(101, { moves: [{ moveId: 1, tags: [], adoptionRate: Number.POSITIVE_INFINITY }] }),
        pokemon(102),
      ]),
    ],
  ])("%sを拒否する", (_name, archetype) => {
    expect(() => buildCounterplan(makeInput(archetype, baseMatrix))).toThrow(RangeError);
  });

  it("不正Selection metricsとmatrixに一致しないassignment resultを拒否する", () => {
    const selection = buildSelectionRecommendation({ matrix: baseMatrix, pickSize: 2 });
    const invalidMetrics = {
      ...selection,
      metrics: { ...selection.metrics, bestScoreSum: Number.POSITIVE_INFINITY },
    };
    const invalidResult = {
      ...selection,
      assignmentsByOpponent: selection.assignmentsByOpponent.map((assignment, index) =>
        index === 0
          ? {
              ...assignment,
              matchupResult: { ...assignment.matchupResult, totalScore: 99, score: 99 },
            }
          : assignment,
      ),
    };

    expect(() => buildCounterplan(makeInput(baseArchetype, baseMatrix, invalidMetrics))).toThrow(
      RangeError,
    );
    expect(() => buildCounterplan(makeInput(baseArchetype, baseMatrix, invalidResult))).toThrow(
      RangeError,
    );
  });
});
