import { Injectable } from "@nestjs/common";
import type {
  CounterplanResult,
  MatchupReasonCode,
  MatchupVerdict,
  StrategyCode,
  StructuredOpponentCounterplan,
} from "@pokemon-champions/matchup";
import {
  COUNTERPLAN_STRATEGY_CODES,
  counterplanExplanationSchema,
  type CounterplanExplanation,
} from "@pokemon-champions/shared";
import type { ExplanationGenerator } from "./explanation-generator";

const CLASSIFICATION_TEXT = {
  favorable: "この対面は有利です。",
  slightly_favorable: "この対面はやや有利です。",
  even: "この対面は互角です。",
  slightly_unfavorable: "この対面はやや不利です。",
  unfavorable: "この対面は不利です。",
} as const satisfies Readonly<Record<MatchupVerdict, string>>;

const REASON_CODE_TEXT = {
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

const STRATEGY_CODE_TEXT = {
  PREVENT_SETUP: "積み技を自由に使わせない。",
  LIMIT_HAZARDS: "場に設置する技を警戒する。",
  STALL_SCREEN_TURNS: "壁の残りターンを意識する。",
  RESPECT_PRIORITY: "先制技の圏内に注意する。",
  MANAGE_STATUS: "状態異常を受ける展開を避ける。",
} as const satisfies Readonly<Record<StrategyCode, string>>;

function lookupText<TCode extends string>(
  values: Readonly<Record<TCode, string>>,
  code: string,
  path: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(values, code)) {
    throw new RangeError(`${path} contains an unsupported code`);
  }
  return values[code as TCode];
}

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function uniqueSortedIds(values: readonly number[], path: string): number[] {
  const result = [...values];
  for (const [index, value] of result.entries()) {
    assertPositiveSafeInteger(value, `${path}[${index}]`);
  }
  if (new Set(result).size !== result.length) {
    throw new RangeError(`${path} must not contain duplicate IDs`);
  }
  return result.sort((left, right) => left - right);
}

function pokemonLabel(pokemonId: number): string {
  assertPositiveSafeInteger(pokemonId, "pokemonId");
  return `ポケモンID ${pokemonId}`;
}

function moveLabel(moveId: number): string {
  assertPositiveSafeInteger(moveId, "moveId");
  return `技ID ${moveId}`;
}

function labels(ids: readonly number[], label: (id: number) => string): string {
  return ids.map(label).join("、");
}

function validateStructuredCodes(input: CounterplanResult): void {
  for (const [opponentIndex, opponent] of input.perOpponent.entries()) {
    for (const [recommendationIndex, recommendation] of opponent.recommendations.entries()) {
      lookupText(
        CLASSIFICATION_TEXT,
        recommendation.classification,
        `perOpponent[${opponentIndex}].recommendations[${recommendationIndex}].classification`,
      );
      for (const [reasonIndex, reasonCode] of recommendation.reasonCodes.entries()) {
        lookupText(
          REASON_CODE_TEXT,
          reasonCode,
          `perOpponent[${opponentIndex}].recommendations[${recommendationIndex}].reasonCodes[${reasonIndex}]`,
        );
      }
    }
  }
  for (const [index, strategyCode] of input.strategyCodes.entries()) {
    lookupText(STRATEGY_CODE_TEXT, strategyCode, `strategyCodes[${index}]`);
  }
}

function buildSelectionExplanation(input: CounterplanResult): string {
  const selectedPokemonIds = uniqueSortedIds(
    input.selection.selectedPokemonIds,
    "selection.selectedPokemonIds",
  );
  if (selectedPokemonIds.length === 0) {
    throw new RangeError("selection.selectedPokemonIds must contain at least one ID");
  }

  const sentences = [`選出は${labels(selectedPokemonIds, pokemonLabel)}です。`];
  if (input.selection.leadPokemonId === null) {
    sentences.push("先発は指定されていません。");
  } else {
    sentences.push(`先発は${pokemonLabel(input.selection.leadPokemonId)}です。`);
  }

  const covered = uniqueSortedIds(
    input.selection.coveredOpponentPokemonIds,
    "selection.coveredOpponentPokemonIds",
  );
  const uncovered = uniqueSortedIds(
    input.selection.uncoveredOpponentPokemonIds,
    "selection.uncoveredOpponentPokemonIds",
  );
  if (uncovered.length === 0) {
    sentences.push("全相手に対応可能です。");
  } else {
    if (covered.length > 0) {
      sentences.push(`対応可能な相手は${labels(covered, pokemonLabel)}です。`);
    }
    sentences.push(`未対応の相手は${labels(uncovered, pokemonLabel)}です。`);
  }

  const assignments = [...input.selection.assignmentsByOpponent].sort(
    (left, right) =>
      left.opponentPokemonId - right.opponentPokemonId ||
      left.assignedSelfPokemonId - right.assignedSelfPokemonId,
  );
  const assignmentPairs = assignments.map((assignment) => {
    assertPositiveSafeInteger(
      assignment.opponentPokemonId,
      "selection.assignmentsByOpponent[].opponentPokemonId",
    );
    assertPositiveSafeInteger(
      assignment.assignedSelfPokemonId,
      "selection.assignmentsByOpponent[].assignedSelfPokemonId",
    );
    return `${pokemonLabel(assignment.opponentPokemonId)}には${pokemonLabel(
      assignment.assignedSelfPokemonId,
    )}`;
  });
  if (assignmentPairs.length > 0) {
    sentences.push(`担当は${assignmentPairs.join("、")}です。`);
  }
  return sentences.join("");
}

function findRankOne(opponent: StructuredOpponentCounterplan) {
  const rankOne = opponent.recommendations.filter(({ rank }) => rank === 1);
  if (rankOne.length !== 1) {
    throw new RangeError(
      `perOpponent for Pokemon ${opponent.opponentPokemonId} must contain exactly one rank 1 recommendation`,
    );
  }
  return rankOne[0]!;
}

function buildOpponentExplanation(opponent: StructuredOpponentCounterplan): string {
  assertPositiveSafeInteger(opponent.opponentPokemonId, "perOpponent[].opponentPokemonId");
  const recommendation = findRankOne(opponent);
  const classification = lookupText(
    CLASSIFICATION_TEXT,
    recommendation.classification,
    "perOpponent[].recommendations[].classification",
  );
  const reasonTexts: string[] = [];
  const seenReasons = new Set<string>();
  for (const reasonCode of recommendation.reasonCodes) {
    if (seenReasons.has(reasonCode)) {
      continue;
    }
    seenReasons.add(reasonCode);
    reasonTexts.push(
      lookupText(REASON_CODE_TEXT, reasonCode, "perOpponent[].recommendations[].reasonCodes[]"),
    );
  }

  const result = recommendation.matchupResult;
  const scoreSentence =
    result.calculationMode === "type_only"
      ? `タイプ相性のみの総合スコアは${recommendation.totalScore}です（攻撃${result.offensiveScore}、防御${result.defensiveScore}）。実数値が未確認のため、ダメージ・確定数・素早さは算出していません。`
      : `総合スコアは${recommendation.totalScore}です（攻撃${result.offensiveScore}、防御${result.defensiveScore}、確定数比較${result.damageRaceScore}）。`;
  const sentences = [
    `${pokemonLabel(opponent.opponentPokemonId)}には${pokemonLabel(
      recommendation.selfPokemonId,
    )}がおすすめです。`,
    classification,
    scoreSentence,
    ...reasonTexts,
  ];

  const avoidIds = uniqueSortedIds(
    opponent.avoidSelfPokemonIds,
    `perOpponent[${opponent.opponentPokemonId}].avoidSelfPokemonIds`,
  );
  if (avoidIds.length > 0) {
    sentences.push(`避ける候補は${labels(avoidIds, pokemonLabel)}です。`);
  }

  const cautionMoveIds: number[] = [];
  const seenMoveIds = new Set<number>();
  for (const cautionMove of opponent.cautionMoves) {
    if (!seenMoveIds.has(cautionMove.moveId)) {
      seenMoveIds.add(cautionMove.moveId);
      cautionMoveIds.push(cautionMove.moveId);
    }
  }
  if (cautionMoveIds.length > 0) {
    sentences.push(`警戒技は${labels(cautionMoveIds, moveLabel)}です。`);
  }

  for (const threatNote of opponent.threatNotes) {
    sentences.push(`登録された警戒事項: ${threatNote.note}`);
  }
  return sentences.join("");
}

function buildStrategyExplanation(input: CounterplanResult): string | null {
  if (input.strategyCodes.length === 0) {
    return null;
  }

  const presentCodes = new Set(input.strategyCodes);
  const strategyTexts = COUNTERPLAN_STRATEGY_CODES.filter((code) => presentCodes.has(code)).map(
    (code) => lookupText(STRATEGY_CODE_TEXT, code, "strategyCodes[]"),
  );
  const sentences = [...strategyTexts];
  if (input.playstyleNotes !== null) {
    sentences.push(`登録された立ち回り: ${input.playstyleNotes}`);
  }
  return sentences.join("");
}

@Injectable()
export class TemplateExplanationGenerator implements ExplanationGenerator {
  async generateCounterplanExplanation(input: CounterplanResult): Promise<CounterplanExplanation> {
    validateStructuredCodes(input);
    const perOpponent = [...input.perOpponent]
      .sort((left, right) => left.opponentPokemonId - right.opponentPokemonId)
      .map((opponent) => ({
        opponentPokemonId: opponent.opponentPokemonId,
        explanation: buildOpponentExplanation(opponent),
      }));

    const result = {
      summary: `相手ポケモン${perOpponent.length}体への対策です。警戒技は${input.cautionMoves.length}件、未対応の相手は${input.selection.uncoveredOpponentPokemonIds.length}体です。`,
      selectionExplanation: buildSelectionExplanation(input),
      perOpponent,
      strategyExplanation: buildStrategyExplanation(input),
    };
    return counterplanExplanationSchema.parse(result);
  }
}
