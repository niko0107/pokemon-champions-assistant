import { DEFAULT_RECOMMEND_DISPLAY_COUNT, PARTY_TEAM_SIZE_MAX } from "@pokemon-champions/shared";
import { DAMAGE_LEVEL_MAX, DAMAGE_LEVEL_MIN } from "./damage-estimation";
import { calculateMatchupScore } from "./matchup-score";
import type {
  CounterplanResult,
  MatchupMatrixCombatant,
  MatchupMatrixInput,
  MatchupMatrixResult,
  MatchupScore,
  MyPartySnapshot,
  OpponentRecommendation,
  PredictedTeamSnapshot,
  RankedOpponentRecommendation,
} from "./types";

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertRoster(roster: readonly MatchupMatrixCombatant[], path: "self" | "opponents"): void {
  if (!Array.isArray(roster) || roster.length === 0) {
    throw new RangeError(`${path} must contain at least one combatant`);
  }
  if (roster.length > PARTY_TEAM_SIZE_MAX) {
    throw new RangeError(`${path} must contain at most ${PARTY_TEAM_SIZE_MAX} combatants`);
  }

  const pokemonIds = new Set<number>();
  for (const member of roster) {
    assertPositiveSafeInteger(member.combatant.pokemonId, `${path}[].combatant.pokemonId`);
    assertPositiveSafeInteger(member.level, `${path}[].level`);
    if (member.level < DAMAGE_LEVEL_MIN || member.level > DAMAGE_LEVEL_MAX) {
      throw new RangeError(
        `${path}[].level must be between ${DAMAGE_LEVEL_MIN} and ${DAMAGE_LEVEL_MAX}`,
      );
    }
    if (pokemonIds.has(member.combatant.pokemonId)) {
      throw new RangeError(`${path} must not contain duplicate pokemonId values`);
    }
    pokemonIds.add(member.combatant.pokemonId);
  }
}

function comparePokemonId(left: MatchupMatrixCombatant, right: MatchupMatrixCombatant): number {
  return left.combatant.pokemonId - right.combatant.pokemonId;
}

/**
 * 相手1体に対するおすすめ順位の比較規則。
 * 入力配列順やsortの安定性へ依存せず、最後は自分Pokemon IDで必ず決着する。
 */
export function compareMatchupRecommendations(left: MatchupScore, right: MatchupScore): number {
  if (left.totalScore !== right.totalScore) {
    return right.totalScore - left.totalScore;
  }
  if (left.offensiveScore !== right.offensiveScore) {
    return right.offensiveScore - left.offensiveScore;
  }
  if (left.defensiveScore !== right.defensiveScore) {
    return right.defensiveScore - left.defensiveScore;
  }
  if (left.damageRaceScore !== right.damageRaceScore) {
    return right.damageRaceScore - left.damageRaceScore;
  }
  return left.selfPokemonId - right.selfPokemonId;
}

function toRecommendation(result: MatchupScore, index: number): RankedOpponentRecommendation {
  return {
    rank: index + 1,
    recommendedSelfPokemonId: result.selfPokemonId,
    myPokemonId: result.selfPokemonId,
    score: result.totalScore,
    matchupResult: result,
    reasonCodes: [...result.reasonCodes],
    cautionMoveIds: [],
  };
}

function buildOpponentRecommendation(
  opponentPokemonId: number,
  cells: readonly MatchupScore[],
): OpponentRecommendation {
  const ranked = cells
    .filter((cell) => cell.opponentPokemonId === opponentPokemonId)
    .sort(compareMatchupRecommendations);

  return {
    opponentPokemonId,
    recommendations: ranked.slice(0, DEFAULT_RECOMMEND_DISPLAY_COUNT).map(toRecommendation),
    avoidMyPokemonIds: ranked
      .filter((cell) => cell.classification === "unfavorable")
      .map((cell) => cell.selfPokemonId)
      .sort((left, right) => left - right),
  };
}

/**
 * 自分Pokemon × 相手Pokemonの全セルと、相手ごとの上位3体を算出する。
 * 行・列はPokemon ID昇順とし、各セルはMATCHUP-004の結果をそのまま保持する。
 */
export function buildMatchupMatrix(input: MatchupMatrixInput): MatchupMatrixResult {
  assertRoster(input.self, "self");
  assertRoster(input.opponents, "opponents");

  const self = [...input.self].sort(comparePokemonId);
  const opponents = [...input.opponents].sort(comparePokemonId);
  const cells = self.flatMap((selfMember) =>
    opponents.map((opponentMember) =>
      calculateMatchupScore({
        self: selfMember.combatant,
        selfLevel: selfMember.level,
        opponent: opponentMember.combatant,
        opponentLevel: opponentMember.level,
      }),
    ),
  );
  const perOpponent = opponents.map((opponent) =>
    buildOpponentRecommendation(opponent.combatant.pokemonId, cells),
  );

  return {
    matrix: {
      selfPokemonIds: self.map(({ combatant }) => combatant.pokemonId),
      opponentPokemonIds: opponents.map(({ combatant }) => combatant.pokemonId),
      cells,
      scores: cells,
    },
    perOpponent,
    recommendationsByOpponent: perOpponent,
  };
}

/**
 * 相性マトリクス(6×6)からおすすめ選出・警戒技を算出する(設計書 §9.4〜9.5)。
 * 純粋関数として実装すること。
 *
 * 実装タスク: MATCHUP-005(マトリクス)/ MATCHUP-006(選出提案)/ MATCHUP-007(警戒技)
 */
export function buildCounterplan(
  _myParty: MyPartySnapshot,
  _predictedTeam: PredictedTeamSnapshot,
): CounterplanResult {
  throw new Error("Not implemented yet — MATCHUP-006 以降のタスクで実装する");
}
