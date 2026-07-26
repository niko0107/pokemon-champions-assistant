import {
  DEFAULT_RECOMMEND_DISPLAY_COUNT,
  MOVE_TAGS,
  PARTY_TEAM_SIZE_MAX,
} from "@pokemon-champions/shared";
import { DAMAGE_LEVEL_MAX, DAMAGE_LEVEL_MIN } from "./damage-estimation";
import { calculateMatchupScore, classifyMatchupScore } from "./matchup-score";
import type {
  CautionMoveTag,
  CounterplanInput,
  CounterplanResult,
  MatchupMatrixCombatant,
  MatchupMatrixInput,
  MatchupMatrixResult,
  MatchupScore,
  OpponentRecommendation,
  RankedOpponentRecommendation,
  SelectionAssignment,
  SelectionMetrics,
  SelectionRecommendation,
  SelectionRecommendationInput,
  StrategyCode,
  StructuredCautionMove,
  StructuredOpponentCounterplan,
  StructuredOpponentRecommendation,
  StructuredThreatNote,
} from "./types";

const DAMAGE_RACE_SCORES: ReadonlySet<number> = new Set([-15, -10, -5, 0, 5, 10, 15]);
const TYPE_MULTIPLIERS: ReadonlySet<number> = new Set([0, 0.25, 0.5, 1, 2, 4]);
const MOVE_TAG_SET: ReadonlySet<string> = new Set(MOVE_TAGS);
const CAUTION_TAG_PRIORITY = [
  "setup",
  "hazard",
  "screen",
  "priority",
  "status",
] as const satisfies readonly CautionMoveTag[];
const STRATEGY_CODE_BY_TAG: Readonly<Record<CautionMoveTag, StrategyCode>> = {
  setup: "PREVENT_SETUP",
  hazard: "LIMIT_HAZARDS",
  screen: "STALL_SCREEN_TURNS",
  priority: "RESPECT_PRIORITY",
  status: "MANAGE_STATUS",
};

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

function assertIntegerInRange(value: number, min: number, max: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${path} must be an integer between ${min} and ${max}`);
  }
}

function assertNullablePositiveSafeInteger(value: number | null, path: string): void {
  if (value !== null) {
    assertPositiveSafeInteger(value, path);
  }
}

function assertNullableTypeMultiplier(value: number | null, path: string): void {
  if (value !== null && !TYPE_MULTIPLIERS.has(value)) {
    throw new RangeError(`${path} must be a supported type multiplier or null`);
  }
}

function assertMatchupScore(score: MatchupScore, path: string): void {
  assertPositiveSafeInteger(score.selfPokemonId, `${path}.selfPokemonId`);
  assertPositiveSafeInteger(score.myPokemonId, `${path}.myPokemonId`);
  assertPositiveSafeInteger(score.opponentPokemonId, `${path}.opponentPokemonId`);
  if (score.myPokemonId !== score.selfPokemonId) {
    throw new RangeError(`${path}.myPokemonId must match selfPokemonId`);
  }

  assertIntegerInRange(score.offensiveScore, 0, 30, `${path}.offensiveScore`);
  assertIntegerInRange(score.defensiveScore, 0, 30, `${path}.defensiveScore`);
  if (!DAMAGE_RACE_SCORES.has(score.damageRaceScore)) {
    throw new RangeError(`${path}.damageRaceScore must be a supported damage race score`);
  }
  assertIntegerInRange(score.totalScore, -100, 100, `${path}.totalScore`);
  if (score.score !== score.totalScore) {
    throw new RangeError(`${path}.score must match totalScore`);
  }
  const expectedClassification = classifyMatchupScore(score.totalScore);
  if (score.classification !== expectedClassification || score.verdict !== expectedClassification) {
    throw new RangeError(`${path}.classification and verdict must match totalScore`);
  }
  if (
    score.breakdown.offense !== score.offensiveScore ||
    score.breakdown.defense !== score.defensiveScore ||
    score.breakdown.damageRace !== score.damageRaceScore
  ) {
    throw new RangeError(`${path}.breakdown must match the approved score fields`);
  }

  assertNullablePositiveSafeInteger(score.bestOffensiveMoveId, `${path}.bestOffensiveMoveId`);
  assertNullablePositiveSafeInteger(score.mostThreateningMoveId, `${path}.mostThreateningMoveId`);
  assertNullablePositiveSafeInteger(score.outgoingKnockoutCount, `${path}.outgoingKnockoutCount`);
  assertNullablePositiveSafeInteger(score.incomingKnockoutCount, `${path}.incomingKnockoutCount`);
  assertNullableTypeMultiplier(score.offensiveTypeMultiplier, `${path}.offensiveTypeMultiplier`);
  assertNullableTypeMultiplier(score.defensiveTypeMultiplier, `${path}.defensiveTypeMultiplier`);
}

function normalizeIdList(
  values: readonly number[],
  path: string,
  options: { allowEmpty: boolean },
): number[] {
  if (!Array.isArray(values) || (!options.allowEmpty && values.length === 0)) {
    throw new RangeError(`${path} must contain at least one Pokemon ID`);
  }
  if (values.length > PARTY_TEAM_SIZE_MAX) {
    throw new RangeError(`${path} must contain at most ${PARTY_TEAM_SIZE_MAX} Pokemon IDs`);
  }

  const seen = new Set<number>();
  for (const value of values) {
    assertPositiveSafeInteger(value, `${path}[]`);
    if (seen.has(value)) {
      throw new RangeError(`${path} must not contain duplicate Pokemon IDs`);
    }
    seen.add(value);
  }
  return [...values].sort((left, right) => left - right);
}

interface ValidatedSelectionMatrix {
  readonly selfPokemonIds: readonly number[];
  readonly opponentPokemonIds: readonly number[];
  readonly cellsByPair: ReadonlyMap<string, MatchupScore>;
}

function matchupPairKey(selfPokemonId: number, opponentPokemonId: number): string {
  return `${selfPokemonId}:${opponentPokemonId}`;
}

function validateSelectionMatrix(result: MatchupMatrixResult): ValidatedSelectionMatrix {
  const selfPokemonIds = normalizeIdList(result.matrix.selfPokemonIds, "matrix.selfPokemonIds", {
    allowEmpty: false,
  });
  const opponentPokemonIds = normalizeIdList(
    result.matrix.opponentPokemonIds,
    "matrix.opponentPokemonIds",
    { allowEmpty: false },
  );
  if (!Array.isArray(result.matrix.cells)) {
    throw new RangeError("matrix.cells must be an array");
  }

  const expectedCellCount = selfPokemonIds.length * opponentPokemonIds.length;
  if (result.matrix.cells.length !== expectedCellCount) {
    throw new RangeError(`matrix.cells must contain exactly ${expectedCellCount} cells`);
  }

  const selfIdSet = new Set(selfPokemonIds);
  const opponentIdSet = new Set(opponentPokemonIds);
  const cellsByPair = new Map<string, MatchupScore>();
  for (const [index, cell] of result.matrix.cells.entries()) {
    assertMatchupScore(cell, `matrix.cells[${index}]`);
    if (!selfIdSet.has(cell.selfPokemonId)) {
      throw new RangeError(`matrix.cells[${index}] contains an unknown selfPokemonId`);
    }
    if (!opponentIdSet.has(cell.opponentPokemonId)) {
      throw new RangeError(`matrix.cells[${index}] contains an unknown opponentPokemonId`);
    }

    const key = matchupPairKey(cell.selfPokemonId, cell.opponentPokemonId);
    if (cellsByPair.has(key)) {
      throw new RangeError(`matrix.cells contains duplicate pair ${key}`);
    }
    cellsByPair.set(key, cell);
  }

  for (const selfPokemonId of selfPokemonIds) {
    for (const opponentPokemonId of opponentPokemonIds) {
      if (!cellsByPair.has(matchupPairKey(selfPokemonId, opponentPokemonId))) {
        throw new RangeError(`matrix.cells is missing pair ${selfPokemonId}:${opponentPokemonId}`);
      }
    }
  }

  return { selfPokemonIds, opponentPokemonIds, cellsByPair };
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareIdLists(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

/** 1〜6体からpickSize体を、ID昇順・組み合わせ辞書順で重複なく列挙する。 */
export function generateSelectionCombinations(
  pokemonIds: readonly number[],
  pickSize: number,
): number[][] {
  const normalizedIds = normalizeIdList(pokemonIds, "pokemonIds", { allowEmpty: false });
  assertPositiveSafeInteger(pickSize, "pickSize");
  if (pickSize > normalizedIds.length) {
    throw new RangeError("pickSize must not exceed the number of Pokemon");
  }

  const combinations: number[][] = [];
  const current: number[] = [];
  const visit = (startIndex: number): void => {
    if (current.length === pickSize) {
      combinations.push([...current]);
      return;
    }

    const remainingNeeded = pickSize - current.length;
    for (let index = startIndex; index <= normalizedIds.length - remainingNeeded; index += 1) {
      const pokemonId = normalizedIds[index];
      if (pokemonId === undefined) {
        throw new RangeError("pokemonIds contains an invalid index");
      }
      current.push(pokemonId);
      visit(index + 1);
      current.pop();
    }
  };

  visit(0);
  return combinations;
}

function getCell(
  cellsByPair: ReadonlyMap<string, MatchupScore>,
  selfPokemonId: number,
  opponentPokemonId: number,
): MatchupScore {
  const cell = cellsByPair.get(matchupPairKey(selfPokemonId, opponentPokemonId));
  if (cell === undefined) {
    throw new RangeError(`matrix.cells is missing pair ${selfPokemonId}:${opponentPokemonId}`);
  }
  return cell;
}

interface EvaluatedSelection {
  readonly selectedPokemonIds: readonly number[];
  readonly assignmentsByOpponent: readonly SelectionAssignment[];
  readonly coveredOpponentPokemonIds: readonly number[];
  readonly uncoveredOpponentPokemonIds: readonly number[];
  readonly metrics: SelectionMetrics;
}

function evaluateSelection(
  selectedPokemonIds: readonly number[],
  opponentPokemonIds: readonly number[],
  priorityOpponentIdSet: ReadonlySet<number>,
  cellsByPair: ReadonlyMap<string, MatchupScore>,
): EvaluatedSelection {
  const assignmentsByOpponent: SelectionAssignment[] = [];
  const coveredOpponentPokemonIds: number[] = [];
  const uncoveredOpponentPokemonIds: number[] = [];
  let priorityCoveredCount = 0;
  let bestScoreSum = 0;
  let secondBestScoreSum = 0;
  let worstBestScore = 100;

  for (const opponentPokemonId of opponentPokemonIds) {
    const ranked = selectedPokemonIds
      .map((selfPokemonId) => getCell(cellsByPair, selfPokemonId, opponentPokemonId))
      .sort(compareMatchupRecommendations);
    const best = ranked[0];
    if (best === undefined) {
      throw new RangeError("selectedPokemonIds must contain at least one Pokemon");
    }

    assignmentsByOpponent.push({
      opponentPokemonId,
      assignedSelfPokemonId: best.selfPokemonId,
      matchupResult: best,
    });
    bestScoreSum += best.totalScore;
    secondBestScoreSum += ranked[1]?.totalScore ?? 0;
    worstBestScore = Math.min(worstBestScore, best.totalScore);

    if (best.totalScore >= -9) {
      coveredOpponentPokemonIds.push(opponentPokemonId);
      if (priorityOpponentIdSet.has(opponentPokemonId)) {
        priorityCoveredCount += 1;
      }
    } else {
      uncoveredOpponentPokemonIds.push(opponentPokemonId);
    }
  }

  return {
    selectedPokemonIds: [...selectedPokemonIds],
    assignmentsByOpponent,
    coveredOpponentPokemonIds,
    uncoveredOpponentPokemonIds,
    metrics: {
      priorityCoveredCount,
      coveredCount: coveredOpponentPokemonIds.length,
      worstBestScore,
      bestScoreSum,
      secondBestScoreSum,
    },
  };
}

function compareEvaluatedSelections(left: EvaluatedSelection, right: EvaluatedSelection): number {
  if (left.metrics.priorityCoveredCount !== right.metrics.priorityCoveredCount) {
    return right.metrics.priorityCoveredCount - left.metrics.priorityCoveredCount;
  }
  if (left.metrics.coveredCount !== right.metrics.coveredCount) {
    return right.metrics.coveredCount - left.metrics.coveredCount;
  }
  if (left.metrics.worstBestScore !== right.metrics.worstBestScore) {
    return right.metrics.worstBestScore - left.metrics.worstBestScore;
  }
  if (left.metrics.bestScoreSum !== right.metrics.bestScoreSum) {
    return right.metrics.bestScoreSum - left.metrics.bestScoreSum;
  }
  if (left.metrics.secondBestScoreSum !== right.metrics.secondBestScoreSum) {
    return right.metrics.secondBestScoreSum - left.metrics.secondBestScoreSum;
  }
  return compareIdLists(left.selectedPokemonIds, right.selectedPokemonIds);
}

interface LeadEvaluation {
  readonly selfPokemonId: number;
  readonly priorityWorstScore: number;
  readonly priorityScoreSum: number;
  readonly priorityOffensiveScoreSum: number;
}

function determineLeadPokemonId(
  selectedPokemonIds: readonly number[],
  priorityOpponentPokemonIds: readonly number[],
  cellsByPair: ReadonlyMap<string, MatchupScore>,
): number | null {
  if (priorityOpponentPokemonIds.length === 0) {
    return null;
  }

  const candidates: LeadEvaluation[] = selectedPokemonIds.map((selfPokemonId) => {
    const priorityCells = priorityOpponentPokemonIds.map((opponentPokemonId) =>
      getCell(cellsByPair, selfPokemonId, opponentPokemonId),
    );
    return {
      selfPokemonId,
      priorityWorstScore: Math.min(...priorityCells.map((cell) => cell.totalScore)),
      priorityScoreSum: priorityCells.reduce((sum, cell) => sum + cell.totalScore, 0),
      priorityOffensiveScoreSum: priorityCells.reduce((sum, cell) => sum + cell.offensiveScore, 0),
    };
  });

  candidates.sort(
    (left, right) =>
      right.priorityWorstScore - left.priorityWorstScore ||
      right.priorityScoreSum - left.priorityScoreSum ||
      right.priorityOffensiveScoreSum - left.priorityOffensiveScoreSum ||
      left.selfPokemonId - right.selfPokemonId,
  );
  return candidates[0]?.selfPokemonId ?? null;
}

function cloneMatchupScore(score: MatchupScore): MatchupScore {
  return {
    ...score,
    outgoingDamage: score.outgoingDamage === null ? null : { ...score.outgoingDamage },
    incomingDamage: score.incomingDamage === null ? null : { ...score.incomingDamage },
    reasonCodes: [...score.reasonCodes],
    breakdown: { ...score.breakdown },
  };
}

function damageResultsEqual(
  left: MatchupScore["outgoingDamage"],
  right: MatchupScore["outgoingDamage"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.moveId === right.moveId &&
    left.category === right.category &&
    left.minDamage === right.minDamage &&
    left.maxDamage === right.maxDamage &&
    left.minDamagePercent === right.minDamagePercent &&
    left.maxDamagePercent === right.maxDamagePercent &&
    left.typeMultiplier === right.typeMultiplier &&
    left.stabMultiplier === right.stabMultiplier &&
    left.attackerStat === right.attackerStat &&
    left.defenderStat === right.defenderStat &&
    left.canDamage === right.canDamage &&
    left.isImmune === right.isImmune &&
    left.knockoutCount === right.knockoutCount &&
    left.possibleKnockoutCount === right.possibleKnockoutCount &&
    left.knockoutClassification === right.knockoutClassification
  );
}

function matchupScoresEqual(left: MatchupScore, right: MatchupScore): boolean {
  return (
    left.selfPokemonId === right.selfPokemonId &&
    left.myPokemonId === right.myPokemonId &&
    left.opponentPokemonId === right.opponentPokemonId &&
    left.offensiveScore === right.offensiveScore &&
    left.defensiveScore === right.defensiveScore &&
    left.damageRaceScore === right.damageRaceScore &&
    left.totalScore === right.totalScore &&
    left.classification === right.classification &&
    left.bestOffensiveMoveId === right.bestOffensiveMoveId &&
    left.mostThreateningMoveId === right.mostThreateningMoveId &&
    damageResultsEqual(left.outgoingDamage, right.outgoingDamage) &&
    damageResultsEqual(left.incomingDamage, right.incomingDamage) &&
    left.outgoingKnockoutCount === right.outgoingKnockoutCount &&
    left.incomingKnockoutCount === right.incomingKnockoutCount &&
    left.offensiveTypeMultiplier === right.offensiveTypeMultiplier &&
    left.defensiveTypeMultiplier === right.defensiveTypeMultiplier &&
    arraysEqual(left.reasonCodes, right.reasonCodes) &&
    left.score === right.score &&
    left.verdict === right.verdict &&
    left.breakdown.offense === right.breakdown.offense &&
    left.breakdown.defense === right.breakdown.defense &&
    left.breakdown.speed === right.breakdown.speed &&
    left.breakdown.damageRace === right.breakdown.damageRace &&
    left.breakdown.priority === right.breakdown.priority &&
    left.breakdown.statusResist === right.breakdown.statusResist &&
    left.breakdown.setupCounter === right.breakdown.setupCounter
  );
}

/** 承認済み辞書式比較により、任意pickSizeの最良選出組とpriority基準の先発を返す。 */
export function buildSelectionRecommendation(
  input: SelectionRecommendationInput,
): SelectionRecommendation {
  const validated = validateSelectionMatrix(input.matrix);
  assertPositiveSafeInteger(input.pickSize, "pickSize");
  if (input.pickSize > validated.selfPokemonIds.length) {
    throw new RangeError("pickSize must not exceed the number of self Pokemon");
  }

  const priorityOpponentPokemonIds = normalizeIdList(
    input.priorityOpponentPokemonIds ?? [],
    "priorityOpponentPokemonIds",
    { allowEmpty: true },
  );
  const opponentIdSet = new Set(validated.opponentPokemonIds);
  for (const opponentPokemonId of priorityOpponentPokemonIds) {
    if (!opponentIdSet.has(opponentPokemonId)) {
      throw new RangeError(
        "priorityOpponentPokemonIds must be a subset of matrix opponentPokemonIds",
      );
    }
  }
  const priorityOpponentIdSet = new Set(priorityOpponentPokemonIds);

  const evaluated = generateSelectionCombinations(validated.selfPokemonIds, input.pickSize)
    .map((selectedPokemonIds) =>
      evaluateSelection(
        selectedPokemonIds,
        validated.opponentPokemonIds,
        priorityOpponentIdSet,
        validated.cellsByPair,
      ),
    )
    .sort(compareEvaluatedSelections);
  const best = evaluated[0];
  if (best === undefined) {
    throw new RangeError("no selection combination could be generated");
  }

  return {
    selectedPokemonIds: [...best.selectedPokemonIds],
    leadPokemonId: determineLeadPokemonId(
      best.selectedPokemonIds,
      priorityOpponentPokemonIds,
      validated.cellsByPair,
    ),
    assignmentsByOpponent: best.assignmentsByOpponent.map((assignment) => ({
      opponentPokemonId: assignment.opponentPokemonId,
      assignedSelfPokemonId: assignment.assignedSelfPokemonId,
      matchupResult: cloneMatchupScore(assignment.matchupResult),
    })),
    coveredOpponentPokemonIds: [...best.coveredOpponentPokemonIds],
    uncoveredOpponentPokemonIds: [...best.uncoveredOpponentPokemonIds],
    metrics: { ...best.metrics },
  };
}

function assertRate(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${path} must be a finite number between 0 and 1`);
  }
}

interface ValidatedArchetype {
  readonly opponentPokemonIds: readonly number[];
  readonly pokemons: readonly CounterplanInput["archetype"]["pokemons"][number][];
  readonly playstyleNotes: string | null;
}

function validateArchetype(input: CounterplanInput["archetype"]): ValidatedArchetype {
  if (!Array.isArray(input.pokemons) || input.pokemons.length === 0) {
    throw new RangeError("archetype.pokemons must contain at least one Pokemon");
  }
  if (input.pokemons.length > PARTY_TEAM_SIZE_MAX) {
    throw new RangeError(`archetype.pokemons must contain at most ${PARTY_TEAM_SIZE_MAX} Pokemon`);
  }
  if (
    input.playstyleNotes !== undefined &&
    input.playstyleNotes !== null &&
    typeof input.playstyleNotes !== "string"
  ) {
    throw new RangeError("archetype.playstyleNotes must be a string or null");
  }

  const pokemonIds = new Set<number>();
  for (const [pokemonIndex, pokemon] of input.pokemons.entries()) {
    const pokemonPath = `archetype.pokemons[${pokemonIndex}]`;
    assertPositiveSafeInteger(pokemon.pokemonId, `${pokemonPath}.pokemonId`);
    if (pokemonIds.has(pokemon.pokemonId)) {
      throw new RangeError("archetype.pokemons must not contain duplicate pokemonId values");
    }
    pokemonIds.add(pokemon.pokemonId);
    assertRate(pokemon.usageRate, `${pokemonPath}.usageRate`);
    if (
      pokemon.threatNotes !== undefined &&
      pokemon.threatNotes !== null &&
      typeof pokemon.threatNotes !== "string"
    ) {
      throw new RangeError(`${pokemonPath}.threatNotes must be a string or null`);
    }
    if (!Array.isArray(pokemon.moves)) {
      throw new RangeError(`${pokemonPath}.moves must be an array`);
    }

    const moveIds = new Set<number>();
    for (const [moveIndex, move] of pokemon.moves.entries()) {
      const movePath = `${pokemonPath}.moves[${moveIndex}]`;
      assertPositiveSafeInteger(move.moveId, `${movePath}.moveId`);
      if (moveIds.has(move.moveId)) {
        throw new RangeError(`${pokemonPath}.moves must not contain duplicate moveId values`);
      }
      moveIds.add(move.moveId);
      assertRate(move.adoptionRate, `${movePath}.adoptionRate`);
      if (!Array.isArray(move.tags)) {
        throw new RangeError(`${movePath}.tags must be an array`);
      }
      const tags = new Set<string>();
      for (const tag of move.tags) {
        if (!MOVE_TAG_SET.has(tag)) {
          throw new RangeError(`${movePath}.tags contains an unsupported MoveTag`);
        }
        if (tags.has(tag)) {
          throw new RangeError(`${movePath}.tags must not contain duplicates`);
        }
        tags.add(tag);
      }
    }
  }

  return {
    opponentPokemonIds: [...pokemonIds].sort((left, right) => left - right),
    pokemons: input.pokemons,
    playstyleNotes:
      input.playstyleNotes === undefined ||
      input.playstyleNotes === null ||
      input.playstyleNotes.trim().length === 0
        ? null
        : input.playstyleNotes,
  };
}

function assertStrictlyAscending(values: readonly number[], path: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index - 1] ?? 0) >= (values[index] ?? 0)) {
      throw new RangeError(`${path} must be strictly ascending`);
    }
  }
}

function validateSelection(
  selection: SelectionRecommendation,
  matrix: ValidatedSelectionMatrix,
): void {
  const selectedPokemonIds = normalizeIdList(
    selection.selectedPokemonIds,
    "selection.selectedPokemonIds",
    { allowEmpty: false },
  );
  assertStrictlyAscending(selection.selectedPokemonIds, "selection.selectedPokemonIds");
  const selfIdSet = new Set(matrix.selfPokemonIds);
  for (const pokemonId of selectedPokemonIds) {
    if (!selfIdSet.has(pokemonId)) {
      throw new RangeError("selection.selectedPokemonIds must be a subset of matrix self IDs");
    }
  }

  if (selection.leadPokemonId !== null) {
    assertPositiveSafeInteger(selection.leadPokemonId, "selection.leadPokemonId");
    if (!selectedPokemonIds.includes(selection.leadPokemonId)) {
      throw new RangeError("selection.leadPokemonId must be included in selectedPokemonIds");
    }
  }

  if (!Array.isArray(selection.assignmentsByOpponent)) {
    throw new RangeError("selection.assignmentsByOpponent must be an array");
  }
  if (selection.assignmentsByOpponent.length !== matrix.opponentPokemonIds.length) {
    throw new RangeError("selection.assignmentsByOpponent must contain every opponent");
  }

  const assignmentsByOpponent = new Map<number, SelectionAssignment>();
  for (const [index, assignment] of selection.assignmentsByOpponent.entries()) {
    const path = `selection.assignmentsByOpponent[${index}]`;
    assertPositiveSafeInteger(assignment.opponentPokemonId, `${path}.opponentPokemonId`);
    assertPositiveSafeInteger(assignment.assignedSelfPokemonId, `${path}.assignedSelfPokemonId`);
    if (assignmentsByOpponent.has(assignment.opponentPokemonId)) {
      throw new RangeError("selection.assignmentsByOpponent must not contain duplicates");
    }
    if (!selectedPokemonIds.includes(assignment.assignedSelfPokemonId)) {
      throw new RangeError(`${path}.assignedSelfPokemonId must be selected`);
    }
    const cell = getCell(
      matrix.cellsByPair,
      assignment.assignedSelfPokemonId,
      assignment.opponentPokemonId,
    );
    assertMatchupScore(assignment.matchupResult, `${path}.matchupResult`);
    if (!matchupScoresEqual(assignment.matchupResult, cell)) {
      throw new RangeError(`${path}.matchupResult must match the matrix cell`);
    }

    const ranked = selectedPokemonIds
      .map((selfPokemonId) =>
        getCell(matrix.cellsByPair, selfPokemonId, assignment.opponentPokemonId),
      )
      .sort(compareMatchupRecommendations);
    if (ranked[0]?.selfPokemonId !== assignment.assignedSelfPokemonId) {
      throw new RangeError(`${path} must assign the best selected Pokemon`);
    }
    assignmentsByOpponent.set(assignment.opponentPokemonId, assignment);
  }
  if (
    !arraysEqual(
      [...assignmentsByOpponent.keys()].sort((left, right) => left - right),
      matrix.opponentPokemonIds,
    )
  ) {
    throw new RangeError("selection.assignmentsByOpponent IDs must match matrix opponents");
  }

  const expectedCovered = matrix.opponentPokemonIds.filter(
    (opponentPokemonId) =>
      (assignmentsByOpponent.get(opponentPokemonId)?.matchupResult.totalScore ?? -100) >= -9,
  );
  const expectedUncovered = matrix.opponentPokemonIds.filter(
    (opponentPokemonId) =>
      (assignmentsByOpponent.get(opponentPokemonId)?.matchupResult.totalScore ?? 100) <= -10,
  );
  if (
    !arraysEqual(selection.coveredOpponentPokemonIds, expectedCovered) ||
    !arraysEqual(selection.uncoveredOpponentPokemonIds, expectedUncovered)
  ) {
    throw new RangeError("selection coverage IDs must match assignment classifications");
  }

  const bestScores = matrix.opponentPokemonIds.map(
    (opponentPokemonId) =>
      assignmentsByOpponent.get(opponentPokemonId)?.matchupResult.totalScore ?? 0,
  );
  const secondBestScoreSum = matrix.opponentPokemonIds.reduce(
    (sum, opponentPokemonId) =>
      sum +
      (selectedPokemonIds
        .map((selfPokemonId) => getCell(matrix.cellsByPair, selfPokemonId, opponentPokemonId))
        .sort(compareMatchupRecommendations)[1]?.totalScore ?? 0),
    0,
  );
  const expectedMetrics: Omit<SelectionMetrics, "priorityCoveredCount"> = {
    coveredCount: expectedCovered.length,
    worstBestScore: Math.min(...bestScores),
    bestScoreSum: bestScores.reduce((sum, score) => sum + score, 0),
    secondBestScoreSum,
  };
  assertIntegerInRange(
    selection.metrics.priorityCoveredCount,
    0,
    expectedCovered.length,
    "selection.metrics.priorityCoveredCount",
  );
  for (const key of Object.keys(expectedMetrics) as Array<keyof typeof expectedMetrics>) {
    if (selection.metrics[key] !== expectedMetrics[key]) {
      throw new RangeError(`selection.metrics.${key} must match the matrix`);
    }
  }
}

function compareCautionMoves(left: StructuredCautionMove, right: StructuredCautionMove): number {
  return (
    CAUTION_TAG_PRIORITY.indexOf(left.primaryTag) -
      CAUTION_TAG_PRIORITY.indexOf(right.primaryTag) ||
    right.adoptionRate - left.adoptionRate ||
    right.opponentUsageRate - left.opponentUsageRate ||
    left.opponentPokemonId - right.opponentPokemonId ||
    left.moveId - right.moveId
  );
}

function buildCautionMoves(archetype: ValidatedArchetype): StructuredCautionMove[] {
  const cautionMoves: StructuredCautionMove[] = [];
  for (const pokemon of archetype.pokemons) {
    for (const move of pokemon.moves) {
      const tags = CAUTION_TAG_PRIORITY.filter((tag) => move.tags.includes(tag));
      const primaryTag = tags[0];
      if (primaryTag === undefined) {
        continue;
      }
      cautionMoves.push({
        moveId: move.moveId,
        opponentPokemonId: pokemon.pokemonId,
        tags,
        primaryTag,
        adoptionRate: move.adoptionRate,
        opponentUsageRate: pokemon.usageRate,
      });
    }
  }
  return cautionMoves.sort(compareCautionMoves);
}

function buildThreatNotes(archetype: ValidatedArchetype): StructuredThreatNote[] {
  return archetype.pokemons
    .filter(
      (
        pokemon,
      ): pokemon is typeof pokemon & {
        readonly threatNotes: string;
      } => typeof pokemon.threatNotes === "string" && pokemon.threatNotes.trim().length > 0,
    )
    .map((pokemon) => ({
      opponentPokemonId: pokemon.pokemonId,
      note: pokemon.threatNotes,
      usageRate: pokemon.usageRate,
    }))
    .sort(
      (left, right) =>
        right.usageRate - left.usageRate ||
        left.opponentPokemonId - right.opponentPokemonId ||
        left.note.localeCompare(right.note),
    )
    .map(({ opponentPokemonId, note }) => ({ opponentPokemonId, note }));
}

function buildStrategyCodes(cautionMoves: readonly StructuredCautionMove[]): StrategyCode[] {
  const presentTags = new Set(cautionMoves.flatMap((move) => move.tags));
  return CAUTION_TAG_PRIORITY.filter((tag) => presentTags.has(tag)).map(
    (tag) => STRATEGY_CODE_BY_TAG[tag],
  );
}

function toStructuredRecommendation(
  result: MatchupScore,
  rank: number,
): StructuredOpponentRecommendation {
  const matchupResult = cloneMatchupScore(result);
  return {
    rank,
    selfPokemonId: result.selfPokemonId,
    opponentPokemonId: result.opponentPokemonId,
    totalScore: result.totalScore,
    classification: result.classification,
    reasonCodes: [...result.reasonCodes],
    matchupResult,
  };
}

function buildStructuredPerOpponent(
  matrix: ValidatedSelectionMatrix,
  cautionMoves: readonly StructuredCautionMove[],
  threatNotes: readonly StructuredThreatNote[],
): StructuredOpponentCounterplan[] {
  return matrix.opponentPokemonIds.map((opponentPokemonId) => {
    const ranked = matrix.selfPokemonIds
      .map((selfPokemonId) => getCell(matrix.cellsByPair, selfPokemonId, opponentPokemonId))
      .sort(compareMatchupRecommendations);
    return {
      opponentPokemonId,
      recommendations: ranked
        .slice(0, DEFAULT_RECOMMEND_DISPLAY_COUNT)
        .map((result, index) => toStructuredRecommendation(result, index + 1)),
      avoidSelfPokemonIds: ranked
        .filter((result) => result.classification === "unfavorable")
        .sort(
          (left, right) =>
            left.totalScore - right.totalScore || left.selfPokemonId - right.selfPokemonId,
        )
        .map((result) => result.selfPokemonId),
      cautionMoves: cautionMoves
        .filter((move) => move.opponentPokemonId === opponentPokemonId)
        .map((move) => ({ ...move, tags: [...move.tags] })),
      threatNotes: threatNotes
        .filter((note) => note.opponentPokemonId === opponentPokemonId)
        .map((note) => ({ ...note })),
    };
  });
}

function cloneSelection(selection: SelectionRecommendation): SelectionRecommendation {
  return {
    selectedPokemonIds: [...selection.selectedPokemonIds],
    leadPokemonId: selection.leadPokemonId,
    assignmentsByOpponent: selection.assignmentsByOpponent.map((assignment) => ({
      opponentPokemonId: assignment.opponentPokemonId,
      assignedSelfPokemonId: assignment.assignedSelfPokemonId,
      matchupResult: cloneMatchupScore(assignment.matchupResult),
    })),
    coveredOpponentPokemonIds: [...selection.coveredOpponentPokemonIds],
    uncoveredOpponentPokemonIds: [...selection.uncoveredOpponentPokemonIds],
    metrics: { ...selection.metrics },
  };
}

/** MATCHUP-005〜006の確定結果とArchetype情報から構造化対策情報だけを生成する。 */
export function buildCounterplan(input: CounterplanInput): CounterplanResult {
  const matrix = validateSelectionMatrix(input.matrix);
  const archetype = validateArchetype(input.archetype);
  if (!arraysEqual(matrix.opponentPokemonIds, archetype.opponentPokemonIds)) {
    throw new RangeError("matrix opponent IDs must match archetype Pokemon IDs");
  }
  validateSelection(input.selection, matrix);

  const cautionMoves = buildCautionMoves(archetype);
  const threatNotes = buildThreatNotes(archetype);
  return {
    perOpponent: buildStructuredPerOpponent(matrix, cautionMoves, threatNotes),
    selection: cloneSelection(input.selection),
    playstyleNotes: archetype.playstyleNotes,
    strategyCodes: buildStrategyCodes(cautionMoves),
    cautionMoves: cautionMoves.map((move) => ({ ...move, tags: [...move.tags] })),
    threatNotes: threatNotes.map((note) => ({ ...note })),
  };
}
