import { describe, expect, it } from "vitest";
import { buildSelectionRecommendation, generateSelectionCombinations } from "./counterplan";
import type {
  MatchupMatrixResult,
  MatchupScore,
  MatchupVerdict,
  SelectionRecommendationInput,
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

type ScoreFactory = (selfPokemonId: number, opponentPokemonId: number) => MatchupScore;

function makeMatrix(
  selfPokemonIds: readonly number[],
  opponentPokemonIds: readonly number[],
  scoreFactory: ScoreFactory,
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

function scoreFromTable(
  table: Readonly<Record<string, number>>,
  overrides: Readonly<
    Record<
      string,
      Partial<Pick<MatchupScore, "offensiveScore" | "defensiveScore" | "damageRaceScore">>
    >
  > = {},
): ScoreFactory {
  return (selfPokemonId, opponentPokemonId) => {
    const key = `${selfPokemonId}:${opponentPokemonId}`;
    const totalScore = table[key];
    if (totalScore === undefined) {
      throw new Error(`Missing test score for ${key}`);
    }
    return makeScore(selfPokemonId, opponentPokemonId, totalScore, overrides[key]);
  };
}

function recommend(
  matrix: MatchupMatrixResult,
  pickSize: number,
  priorityOpponentPokemonIds?: readonly number[],
) {
  return buildSelectionRecommendation({
    matrix,
    pickSize,
    priorityOpponentPokemonIds,
  });
}

describe("generateSelectionCombinations", () => {
  it("3体から3体で1組を返す", () => {
    expect(generateSelectionCombinations([3, 1, 2], 3)).toEqual([[1, 2, 3]]);
  });

  it("4体から3体で4組を辞書順に返す", () => {
    expect(generateSelectionCombinations([4, 2, 1, 3], 3)).toEqual([
      [1, 2, 3],
      [1, 2, 4],
      [1, 3, 4],
      [2, 3, 4],
    ]);
  });

  it("6体から3体で重複のない20組を返す", () => {
    const combinations = generateSelectionCombinations([6, 5, 4, 3, 2, 1], 3);
    expect(combinations).toHaveLength(20);
    expect(new Set(combinations.map((ids) => ids.join(","))).size).toBe(20);
    expect(combinations[0]).toEqual([1, 2, 3]);
    expect(combinations.at(-1)).toEqual([4, 5, 6]);
  });

  it("pickSize=1とpickSize=Party人数を扱う", () => {
    expect(generateSelectionCombinations([3, 1, 2], 1)).toEqual([[1], [2], [3]]);
    expect(generateSelectionCombinations([3, 1, 2], 3)).toEqual([[1, 2, 3]]);
  });
});

describe("buildSelectionRecommendation: 選出組の辞書式評価", () => {
  it("priorityCoveredCountを最優先する", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": -10,
        "1:102": 100,
        "2:101": -9,
        "2:102": -100,
      }),
    );

    expect(recommend(matrix, 1, [101]).selectedPokemonIds).toEqual([2]);
  });

  it("priorityCoveredCountが同じならcoveredCountで決める", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 0,
        "1:102": 0,
        "2:101": 0,
        "2:102": -10,
      }),
    );

    expect(recommend(matrix, 1).selectedPokemonIds).toEqual([1]);
  });

  it("coverageが同じならworstBestScoreで決める", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 0,
        "1:102": 0,
        "2:101": -9,
        "2:102": 100,
      }),
    );

    expect(recommend(matrix, 1).selectedPokemonIds).toEqual([1]);
  });

  it("worstBestScoreまで同じならbestScoreSumで決める", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 0,
        "1:102": 10,
        "2:101": 0,
        "2:102": 20,
      }),
    );

    expect(recommend(matrix, 1).selectedPokemonIds).toEqual([2]);
  });

  it("先行指標が同じならsecondBestScoreSumで決める", () => {
    const matrix = makeMatrix(
      [1, 2, 3],
      [101],
      scoreFromTable({
        "1:101": 10,
        "2:101": 5,
        "3:101": 0,
      }),
    );

    const result = recommend(matrix, 2);
    expect(result.selectedPokemonIds).toEqual([1, 2]);
    expect(result.metrics.secondBestScoreSum).toBe(5);
  });

  it("完全同点はselectedPokemonIdsの辞書順昇順で決める", () => {
    const matrix = makeMatrix([4, 3, 2, 1], [101], (selfPokemonId, opponentPokemonId) =>
      makeScore(selfPokemonId, opponentPokemonId, 0),
    );

    expect(recommend(matrix, 2).selectedPokemonIds).toEqual([1, 2]);
  });

  it("全候補が不利でも最も悪くない1組を返す", () => {
    const matrix = makeMatrix([1, 2], [101], scoreFromTable({ "1:101": -50, "2:101": -10 }));

    const result = recommend(matrix, 1);
    expect(result.selectedPokemonIds).toEqual([2]);
    expect(result.coveredOpponentPokemonIds).toEqual([]);
    expect(result.uncoveredOpponentPokemonIds).toEqual([101]);
  });

  it("totalScore=-9をcovered、-10をuncoveredとして集計する", () => {
    const matrix = makeMatrix([1], [101, 102], scoreFromTable({ "1:101": -9, "1:102": -10 }));

    const result = recommend(matrix, 1, [101, 102]);
    expect(result.coveredOpponentPokemonIds).toEqual([101]);
    expect(result.uncoveredOpponentPokemonIds).toEqual([102]);
    expect(result.metrics).toMatchObject({
      priorityCoveredCount: 1,
      coveredCount: 1,
      worstBestScore: -10,
      bestScoreSum: -19,
      secondBestScoreSum: 0,
    });
  });
});

describe("buildSelectionRecommendation: 相手ごとの担当Pokemon", () => {
  it("相手ごとに別の担当Pokemonを選ぶ", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 50,
        "1:102": 0,
        "2:101": 0,
        "2:102": 50,
      }),
    );

    expect(
      recommend(matrix, 2).assignmentsByOpponent.map(
        ({ opponentPokemonId, assignedSelfPokemonId }) => ({
          opponentPokemonId,
          assignedSelfPokemonId,
        }),
      ),
    ).toEqual([
      { opponentPokemonId: 101, assignedSelfPokemonId: 1 },
      { opponentPokemonId: 102, assignedSelfPokemonId: 2 },
    ]);
  });

  it.each([
    {
      name: "totalScore",
      first: { totalScore: 10 },
      second: { totalScore: 20 },
      expected: 2,
    },
    {
      name: "offensiveScore",
      first: { totalScore: 10, offensiveScore: 10 },
      second: { totalScore: 10, offensiveScore: 20 },
      expected: 2,
    },
    {
      name: "defensiveScore",
      first: { totalScore: 10, offensiveScore: 20, defensiveScore: 10 },
      second: { totalScore: 10, offensiveScore: 20, defensiveScore: 20 },
      expected: 2,
    },
    {
      name: "damageRaceScore",
      first: {
        totalScore: 10,
        offensiveScore: 20,
        defensiveScore: 20,
        damageRaceScore: 0,
      },
      second: {
        totalScore: 10,
        offensiveScore: 20,
        defensiveScore: 20,
        damageRaceScore: 5,
      },
      expected: 2,
    },
    {
      name: "selfPokemonId",
      first: {
        totalScore: 10,
        offensiveScore: 20,
        defensiveScore: 20,
        damageRaceScore: 5,
      },
      second: {
        totalScore: 10,
        offensiveScore: 20,
        defensiveScore: 20,
        damageRaceScore: 5,
      },
      expected: 1,
    },
  ])("$nameの比較順をMATCHUP-005と共用する", ({ first, second, expected }) => {
    const matrix = makeMatrix([1, 2], [101], (selfPokemonId, opponentPokemonId) => {
      const values = selfPokemonId === 1 ? first : second;
      return makeScore(selfPokemonId, opponentPokemonId, values.totalScore, {
        offensiveScore: values.offensiveScore,
        defensiveScore: values.defensiveScore,
        damageRaceScore: values.damageRaceScore,
      });
    });

    expect(recommend(matrix, 2).assignmentsByOpponent[0]?.assignedSelfPokemonId).toBe(expected);
  });
});

describe("buildSelectionRecommendation: priority対象からの先発決定", () => {
  it("priority相手1体では最も高いtotalScoreのPokemonを選ぶ", () => {
    const matrix = makeMatrix([1, 2], [101], scoreFromTable({ "1:101": 0, "2:101": 10 }));

    expect(recommend(matrix, 2, [101]).leadPokemonId).toBe(2);
  });

  it("priority相手複数ではpriorityWorstScoreを最優先する", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 0,
        "1:102": 100,
        "2:101": 10,
        "2:102": 10,
      }),
    );

    expect(recommend(matrix, 2, [101, 102]).leadPokemonId).toBe(2);
  });

  it("priorityWorstScore同点ならpriorityScoreSumで決める", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable({
        "1:101": 0,
        "1:102": 10,
        "2:101": 0,
        "2:102": 20,
      }),
    );

    expect(recommend(matrix, 2, [101, 102]).leadPokemonId).toBe(2);
  });

  it("totalScore指標同点ならpriorityOffensiveScoreSumで決める", () => {
    const matrix = makeMatrix(
      [1, 2],
      [101, 102],
      scoreFromTable(
        {
          "1:101": 0,
          "1:102": 0,
          "2:101": 0,
          "2:102": 0,
        },
        {
          "1:101": { offensiveScore: 10 },
          "1:102": { offensiveScore: 10 },
          "2:101": { offensiveScore: 20 },
          "2:102": { offensiveScore: 20 },
        },
      ),
    );

    expect(recommend(matrix, 2, [101, 102]).leadPokemonId).toBe(2);
  });

  it("全指標同点ならselfPokemonId昇順、priorityなしならnull", () => {
    const matrix = makeMatrix([2, 1], [101], (selfPokemonId, opponentPokemonId) =>
      makeScore(selfPokemonId, opponentPokemonId, 0),
    );

    expect(recommend(matrix, 2, [101]).leadPokemonId).toBe(1);
    expect(recommend(matrix, 2).leadPokemonId).toBeNull();
    expect(recommend(matrix, 2, []).leadPokemonId).toBeNull();
  });
});

describe("buildSelectionRecommendation: 検証・決定性・非破壊性", () => {
  const baseMatrix = makeMatrix([1, 2, 3], [101, 102], (selfPokemonId, opponentPokemonId) =>
    makeScore(selfPokemonId, opponentPokemonId, selfPokemonId * 10 - opponentPokemonId + 100),
  );

  it("自分・相手・cell・priorityの入力順が変わっても同じ結果を返す", () => {
    const reordered: MatchupMatrixResult = {
      matrix: {
        selfPokemonIds: [3, 1, 2],
        opponentPokemonIds: [102, 101],
        cells: [...baseMatrix.matrix.cells].reverse(),
        scores: [...baseMatrix.matrix.scores].reverse(),
      },
      perOpponent: [],
      recommendationsByOpponent: [],
    };

    expect(recommend(reordered, 2, [102, 101])).toEqual(recommend(baseMatrix, 2, [101, 102]));
  });

  it("入力を変更せず、同一入力では常に同じ結果を返す", () => {
    const input: SelectionRecommendationInput = {
      matrix: baseMatrix,
      pickSize: 2,
      priorityOpponentPokemonIds: [102, 101],
    };
    const before = structuredClone(input);

    const first = buildSelectionRecommendation(input);
    const second = buildSelectionRecommendation(input);

    expect(input).toEqual(before);
    expect(first).toEqual(second);
  });

  it("返却配列・MatchupResultを変更しても入力や次回結果を壊さない", () => {
    const expected = recommend(baseMatrix, 2, [101]);
    const result = recommend(baseMatrix, 2, [101]);

    (result.selectedPokemonIds as number[])[0] = 999;
    (result.coveredOpponentPokemonIds as number[]).push(999);
    const assigned = result.assignmentsByOpponent[0];
    if (assigned !== undefined) {
      (assigned.matchupResult.reasonCodes as string[]).push("MUTATED");
      assigned.matchupResult.breakdown.offense = 999;
    }

    expect(recommend(baseMatrix, 2, [101])).toEqual(expected);
    expect(baseMatrix.matrix.cells).not.toContainEqual(
      expect.objectContaining({
        reasonCodes: expect.arrayContaining(["MUTATED"]),
      }),
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 4])("pickSize=%sを拒否する", (pickSize) => {
    expect(() => recommend(baseMatrix, pickSize)).toThrow(RangeError);
  });

  it("空配列と7体以上を拒否する", () => {
    const emptySelf = makeMatrix([], [101], () => {
      throw new Error("not called");
    });
    const emptyOpponent = makeMatrix([1], [], () => {
      throw new Error("not called");
    });
    const sevenSelf = makeMatrix([1, 2, 3, 4, 5, 6, 7], [101], (selfPokemonId, opponentPokemonId) =>
      makeScore(selfPokemonId, opponentPokemonId, 0),
    );

    expect(() => recommend(emptySelf, 1)).toThrow(RangeError);
    expect(() => recommend(emptyOpponent, 1)).toThrow(RangeError);
    expect(() => recommend(sevenSelf, 1)).toThrow(RangeError);
  });

  it("自分側・相手側・priorityのID重複を拒否する", () => {
    const duplicateSelf = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, selfPokemonIds: [1, 1, 3] },
    };
    const duplicateOpponent = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, opponentPokemonIds: [101, 101] },
    };

    expect(() => recommend(duplicateSelf, 1)).toThrow(RangeError);
    expect(() => recommend(duplicateOpponent, 1)).toThrow(RangeError);
    expect(() => recommend(baseMatrix, 1, [101, 101])).toThrow(RangeError);
    expect(() => recommend(baseMatrix, 1, [999])).toThrow(RangeError);
  });

  it("cell欠落・重複・未知ID・ID alias不一致を拒否する", () => {
    const missing = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, cells: baseMatrix.matrix.cells.slice(1) },
    };
    const duplicateCells = [
      baseMatrix.matrix.cells[0],
      baseMatrix.matrix.cells[0],
      ...baseMatrix.matrix.cells.slice(2),
    ] as MatchupScore[];
    const duplicate = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, cells: duplicateCells },
    };
    const unknownCells = [...baseMatrix.matrix.cells];
    unknownCells[0] = { ...unknownCells[0]!, selfPokemonId: 999, myPokemonId: 999 };
    const unknown = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, cells: unknownCells },
    };
    const mismatchedCells = [...baseMatrix.matrix.cells];
    mismatchedCells[0] = { ...mismatchedCells[0]!, myPokemonId: 999 };
    const mismatched = {
      ...baseMatrix,
      matrix: { ...baseMatrix.matrix, cells: mismatchedCells },
    };

    expect(() => recommend(missing, 1)).toThrow(RangeError);
    expect(() => recommend(duplicate, 1)).toThrow(RangeError);
    expect(() => recommend(unknown, 1)).toThrow(RangeError);
    expect(() => recommend(mismatched, 1)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 101, -101])(
    "不正totalScore %sを拒否する",
    (totalScore) => {
      const cells = [...baseMatrix.matrix.cells];
      cells[0] = {
        ...cells[0]!,
        totalScore,
        score: totalScore,
      };
      const invalid = {
        ...baseMatrix,
        matrix: { ...baseMatrix.matrix, cells },
      };

      expect(() => recommend(invalid, 1)).toThrow(RangeError);
    },
  );

  it("MATCHUP-004結果の不正な分類・内訳・確定数・倍率を拒否する", () => {
    const mutations: MatchupScore[] = [
      { ...baseMatrix.matrix.cells[0]!, classification: "favorable" },
      {
        ...baseMatrix.matrix.cells[0]!,
        breakdown: { ...baseMatrix.matrix.cells[0]!.breakdown, offense: 99 },
      },
      { ...baseMatrix.matrix.cells[0]!, outgoingKnockoutCount: 0 },
      { ...baseMatrix.matrix.cells[0]!, offensiveTypeMultiplier: 3 as 1 },
    ];

    for (const mutation of mutations) {
      const cells = [...baseMatrix.matrix.cells];
      cells[0] = mutation;
      expect(() =>
        recommend(
          {
            ...baseMatrix,
            matrix: { ...baseMatrix.matrix, cells },
          },
          1,
        ),
      ).toThrow(RangeError);
    }
  });
});
