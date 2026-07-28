import type { CounterplanResult, MatchupScore, MatchupVerdict } from "@pokemon-champions/matchup";

function matchupScore(
  selfPokemonId: number,
  opponentPokemonId: number,
  classification: MatchupVerdict = "favorable",
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
    bestOffensiveMoveId: 11,
    mostThreateningMoveId: 21,
    outgoingDamage: null,
    incomingDamage: null,
    outgoingKnockoutCount: 2,
    incomingKnockoutCount: 3,
    offensiveTypeMultiplier: 2,
    defensiveTypeMultiplier: 1,
    reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
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

export function createCounterplanFixture(
  opponentPokemonIds: readonly number[] = [101],
): CounterplanResult {
  const perOpponent = opponentPokemonIds.map((opponentPokemonId, index) => {
    const selfPokemonId = index + 1;
    const matchupResult = matchupScore(selfPokemonId, opponentPokemonId);
    const cautionMove = {
      moveId: 21 + index,
      opponentPokemonId,
      tags: ["setup", "status"] as const,
      primaryTag: "setup" as const,
      adoptionRate: 0.9,
      opponentUsageRate: 1,
    };
    const threatNote = { opponentPokemonId, note: `警戒事項${index + 1}` };
    return {
      opponentPokemonId,
      recommendations: [
        {
          rank: 1,
          selfPokemonId,
          opponentPokemonId,
          totalScore: 44,
          classification: "favorable" as const,
          reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"] as const,
          matchupResult,
        },
      ],
      avoidSelfPokemonIds: [6],
      cautionMoves: [cautionMove],
      threatNotes: [threatNote],
    };
  });
  const assignments = opponentPokemonIds.map((opponentPokemonId, index) => ({
    opponentPokemonId,
    assignedSelfPokemonId: index + 1,
    matchupResult: matchupScore(index + 1, opponentPokemonId),
  }));

  return {
    perOpponent,
    selection: {
      selectedPokemonIds: opponentPokemonIds.map((_id, index) => index + 1),
      leadPokemonId: 1,
      assignmentsByOpponent: assignments,
      coveredOpponentPokemonIds: [...opponentPokemonIds],
      uncoveredOpponentPokemonIds: [],
      metrics: {
        priorityCoveredCount: opponentPokemonIds.length,
        coveredCount: opponentPokemonIds.length,
        worstBestScore: 44,
        bestScoreSum: 44 * opponentPokemonIds.length,
        secondBestScoreSum: 0,
      },
    },
    playstyleNotes: "壁から展開する",
    strategyCodes: ["PREVENT_SETUP", "MANAGE_STATUS"],
    cautionMoves: perOpponent.flatMap(({ cautionMoves }) => cautionMoves),
    threatNotes: perOpponent.flatMap(({ threatNotes }) => threatNotes),
  };
}

export function createExplanationFixture(opponentPokemonIds: readonly number[] = [101]) {
  return {
    summary: "計算済みの対策をまとめます。",
    selectionExplanation: "指定された選出と先発を維持します。",
    perOpponent: opponentPokemonIds.map((opponentPokemonId) => ({
      opponentPokemonId,
      explanation: `ポケモンID ${opponentPokemonId}への計算済み対策です。`,
    })),
    strategyExplanation: "登録済みの方針を維持します。",
  };
}
