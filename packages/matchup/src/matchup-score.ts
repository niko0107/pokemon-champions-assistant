import { MOVE_CATEGORIES } from "@pokemon-champions/shared";
import {
  DAMAGE_LEVEL_MAX,
  DAMAGE_LEVEL_MIN,
  calculateDamageRange,
  calculateKnockoutCount,
} from "./damage-estimation";
import {
  getCombinedTypeEffectiveness,
  getDefensiveTypeProfile,
  getOffensiveTypeProfile,
} from "./type-effectiveness";
import type {
  CombatantSnapshot,
  DamageCalculationInput,
  DamageRangeResult,
  DefensiveTyping,
  MatchupReasonCode,
  MatchupScore,
  MatchupScoreInput,
  MatchupVerdict,
  MoveSnapshot,
  TypeEffectivenessMultiplier,
} from "./types";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const MOVE_CATEGORY_SET: ReadonlySet<string> = new Set(MOVE_CATEGORIES);

interface EvaluatedMove {
  readonly damage: DamageRangeResult;
  readonly knockoutCount: number | null;
}

interface EvaluatedMoveSet {
  readonly selected: EvaluatedMove | null;
  readonly hasImmuneDamagingMove: boolean;
}

interface TypeOnlyEvaluatedMove {
  readonly moveId: number;
  readonly power: number;
  readonly adoptionRate: number;
  readonly typeMultiplier: TypeEffectivenessMultiplier;
}

interface TypeOnlyEvaluatedMoveSet {
  readonly selected: TypeOnlyEvaluatedMove | null;
  readonly hasImmuneDamagingMove: boolean;
}

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertLevel(value: number, path: string): void {
  assertPositiveSafeInteger(value, path);
  if (value < DAMAGE_LEVEL_MIN || value > DAMAGE_LEVEL_MAX) {
    throw new RangeError(`${path} must be between ${DAMAGE_LEVEL_MIN} and ${DAMAGE_LEVEL_MAX}`);
  }
}

function toDefensiveTyping(combatant: CombatantSnapshot, path: string): DefensiveTyping {
  if (!Array.isArray(combatant.types) || combatant.types.length < 1 || combatant.types.length > 2) {
    throw new RangeError(`${path}.types must contain one or two Pokemon types`);
  }
  const type1 = combatant.types[0];
  if (type1 === undefined) {
    throw new RangeError(`${path}.types must contain one or two Pokemon types`);
  }
  return {
    type1,
    type2: combatant.types[1] ?? null,
  };
}

function assertCombatant(combatant: CombatantSnapshot, path: string): void {
  assertPositiveSafeInteger(combatant.pokemonId, `${path}.pokemonId`);

  getDefensiveTypeProfile(toDefensiveTyping(combatant, path));

  if (combatant.stats !== null) {
    for (const stat of STAT_KEYS) {
      assertPositiveSafeInteger(combatant.stats[stat], `${path}.stats.${stat}`);
    }
  }

  if (!Array.isArray(combatant.moves)) {
    throw new RangeError(`${path}.moves must be an array`);
  }

  const moveIds = new Set<number>();
  for (const move of combatant.moves) {
    assertPositiveSafeInteger(move.moveId, `${path}.moves[].moveId`);
    if (moveIds.has(move.moveId)) {
      throw new RangeError(`${path}.moves must not contain duplicate moveId values`);
    }
    moveIds.add(move.moveId);
    getOffensiveTypeProfile(move.type);
    if (!MOVE_CATEGORY_SET.has(move.category)) {
      throw new RangeError(`${path}.moves[].category must be physical, special, or status`);
    }
  }
}

function toDamageInput(
  attacker: CombatantSnapshot,
  attackerLevel: number,
  defender: CombatantSnapshot,
  move: MoveSnapshot,
): DamageCalculationInput {
  if (attacker.stats === null || defender.stats === null) {
    throw new RangeError("damage calculation requires complete actual stats");
  }
  const attackerTyping = toDefensiveTyping(attacker, "attacker");
  const defenderTyping = toDefensiveTyping(defender, "defender");
  return {
    attacker: {
      pokemonId: attacker.pokemonId,
      level: attackerLevel,
      attack: attacker.stats.atk,
      specialAttack: attacker.stats.spa,
      type1: attackerTyping.type1,
      type2: attackerTyping.type2,
    },
    defender: {
      pokemonId: defender.pokemonId,
      hp: defender.stats.hp,
      defense: defender.stats.def,
      specialDefense: defender.stats.spd,
      type1: defenderTyping.type1,
      type2: defenderTyping.type2,
    },
    move: {
      moveId: move.moveId,
      type: move.type,
      category: move.category,
      power: move.power,
    },
  };
}

function evaluateMovesByType(
  attacker: CombatantSnapshot,
  defender: CombatantSnapshot,
): TypeOnlyEvaluatedMoveSet {
  const defenderTyping = toDefensiveTyping(defender, "defender");
  const evaluated = attacker.moves
    .filter(
      (move): move is MoveSnapshot & { power: number } =>
        move.category !== "status" && move.power !== null,
    )
    .map((move): TypeOnlyEvaluatedMove => ({
      moveId: move.moveId,
      power: move.power,
      adoptionRate: move.adoptionRate,
      typeMultiplier: getCombinedTypeEffectiveness(move.type, defenderTyping),
    }));
  const candidates = evaluated
    .filter(({ typeMultiplier }) => typeMultiplier > 0)
    .sort(
      (left, right) =>
        right.typeMultiplier - left.typeMultiplier ||
        right.power - left.power ||
        right.adoptionRate - left.adoptionRate ||
        left.moveId - right.moveId,
    );
  return {
    selected: candidates[0] ?? null,
    hasImmuneDamagingMove: evaluated.some(({ typeMultiplier }) => typeMultiplier === 0),
  };
}

function compareEvaluatedMoves(left: EvaluatedMove, right: EvaluatedMove): number {
  const leftTurns = left.knockoutCount;
  const rightTurns = right.knockoutCount;
  if (leftTurns === null || rightTurns === null) {
    throw new RangeError("damaging move candidates must have a finite knockout count");
  }
  if (leftTurns !== rightTurns) {
    return leftTurns - rightTurns;
  }
  if (left.damage.maxDamage !== right.damage.maxDamage) {
    return right.damage.maxDamage - left.damage.maxDamage;
  }
  if (left.damage.minDamage !== right.damage.minDamage) {
    return right.damage.minDamage - left.damage.minDamage;
  }
  if (left.damage.typeMultiplier !== right.damage.typeMultiplier) {
    return right.damage.typeMultiplier - left.damage.typeMultiplier;
  }
  return left.damage.moveId - right.damage.moveId;
}

function evaluateMoves(
  attacker: CombatantSnapshot,
  attackerLevel: number,
  defender: CombatantSnapshot,
): EvaluatedMoveSet {
  if (attacker.stats === null || defender.stats === null) {
    throw new RangeError("damage evaluation requires complete actual stats");
  }
  const defenderStats = defender.stats;
  const evaluated = attacker.moves
    .filter((move) => move.category === "status" || move.power !== null)
    .map((move): EvaluatedMove => {
      const damage = calculateDamageRange(toDamageInput(attacker, attackerLevel, defender, move));
      const knockout = calculateKnockoutCount({
        defenderHp: defenderStats.hp,
        minDamage: damage.minDamage,
        maxDamage: damage.maxDamage,
      });
      return {
        damage,
        knockoutCount: knockout.knockoutCount,
      };
    });

  const candidates = evaluated
    .filter(({ damage, knockoutCount }) => damage.canDamage && knockoutCount !== null)
    .sort(compareEvaluatedMoves);

  return {
    selected: candidates[0] ?? null,
    hasImmuneDamagingMove: evaluated.some(
      ({ damage }) => damage.category !== "status" && damage.isImmune,
    ),
  };
}

/** 選択された攻撃技のタイプ倍率を0〜30点へ変換する。 */
export function scoreOffensiveTypeMultiplier(multiplier: TypeEffectivenessMultiplier): number {
  switch (multiplier) {
    case 0:
      return 0;
    case 0.25:
      return 5;
    case 0.5:
      return 10;
    case 1:
      return 15;
    case 2:
      return 25;
    case 4:
      return 30;
    default:
      throw new RangeError("unsupported offensive type multiplier");
  }
}

/** 選択された相手技のタイプ倍率を、自分側に有利なほど高い0〜30点へ変換する。 */
export function scoreDefensiveTypeMultiplier(multiplier: TypeEffectivenessMultiplier): number {
  switch (multiplier) {
    case 0:
      return 30;
    case 0.25:
      return 25;
    case 0.5:
      return 20;
    case 1:
      return 15;
    case 2:
      return 5;
    case 4:
      return 0;
    default:
      throw new RangeError("unsupported defensive type multiplier");
  }
}

function assertTurns(value: number | null, path: string): void {
  if (value !== null) {
    assertPositiveSafeInteger(value, path);
  }
}

/** nullを「倒せない」として扱い、確定数の差を−15〜+15点へ変換する。 */
export function calculateDamageRaceScore(
  outgoingTurns: number | null,
  incomingTurns: number | null,
): number {
  assertTurns(outgoingTurns, "outgoingTurns");
  assertTurns(incomingTurns, "incomingTurns");

  if (outgoingTurns === null && incomingTurns === null) {
    return 0;
  }
  if (outgoingTurns !== null && incomingTurns === null) {
    return 15;
  }
  if (outgoingTurns === null) {
    return -15;
  }
  if (incomingTurns === null) {
    return 15;
  }

  const difference = incomingTurns - outgoingTurns;
  if (difference >= 3) return 15;
  if (difference === 2) return 10;
  if (difference === 1) return 5;
  if (difference === 0) return 0;
  if (difference === -1) return -5;
  if (difference === -2) return -10;
  return -15;
}

function assertScore(value: number, min: number, max: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${path} must be an integer between ${min} and ${max}`);
  }
}

/** 承認済みの中心化・正規化式を整数演算で適用する。 */
export function normalizeMatchupScore(
  offensiveScore: number,
  defensiveScore: number,
  damageRaceScore: number,
): number {
  assertScore(offensiveScore, 0, 30, "offensiveScore");
  assertScore(defensiveScore, 0, 30, "defensiveScore");
  assertScore(damageRaceScore, -15, 15, "damageRaceScore");

  const centeredScore = offensiveScore - 15 + (defensiveScore - 15) + damageRaceScore;
  const numerator = centeredScore * 100;
  const rounded =
    numerator >= 0 ? Math.floor((numerator + 22) / 45) : -Math.floor((-numerator + 22) / 45);
  return Math.max(-100, Math.min(100, rounded));
}

/** 整数化済みの−100〜100点を重複しない判定範囲へ分類する。 */
export function classifyMatchupScore(totalScore: number): MatchupVerdict {
  assertScore(totalScore, -100, 100, "totalScore");
  if (totalScore >= 50) return "favorable";
  if (totalScore >= 10) return "slightly_favorable";
  if (totalScore >= -9) return "even";
  if (totalScore >= -49) return "slightly_unfavorable";
  return "unfavorable";
}

function appendOffensiveReasons(reasons: MatchupReasonCode[], result: EvaluatedMoveSet): void {
  if (result.selected === null) {
    if (result.hasImmuneDamagingMove) reasons.push("BEST_MOVE_IMMUNE");
    reasons.push("NO_DAMAGING_MOVE");
    return;
  }

  if (result.selected.damage.typeMultiplier >= 2) {
    reasons.push("BEST_MOVE_SUPER_EFFECTIVE");
  } else if (result.selected.damage.typeMultiplier <= 0.5) {
    reasons.push("BEST_MOVE_RESISTED");
  }
}

function appendDefensiveReasons(reasons: MatchupReasonCode[], result: EvaluatedMoveSet): void {
  if (result.selected === null) {
    if (result.hasImmuneDamagingMove) reasons.push("IMMUNE_TO_THREAT");
    reasons.push("OPPONENT_NO_DAMAGING_MOVE");
    return;
  }

  if (result.selected.damage.typeMultiplier >= 2) {
    reasons.push("TAKES_SUPER_EFFECTIVE_DAMAGE");
  } else if (result.selected.damage.typeMultiplier <= 0.5) {
    reasons.push("RESISTS_THREAT");
  }
}

function appendTypeOnlyOffensiveReasons(
  reasons: MatchupReasonCode[],
  result: TypeOnlyEvaluatedMoveSet,
): void {
  if (result.selected === null) {
    if (result.hasImmuneDamagingMove) reasons.push("BEST_MOVE_IMMUNE");
    reasons.push("NO_DAMAGING_MOVE");
    return;
  }
  if (result.selected.typeMultiplier >= 2) {
    reasons.push("BEST_MOVE_SUPER_EFFECTIVE");
  } else if (result.selected.typeMultiplier <= 0.5) {
    reasons.push("BEST_MOVE_RESISTED");
  }
}

function appendTypeOnlyDefensiveReasons(
  reasons: MatchupReasonCode[],
  result: TypeOnlyEvaluatedMoveSet,
): void {
  if (result.selected === null) {
    if (result.hasImmuneDamagingMove) reasons.push("IMMUNE_TO_THREAT");
    reasons.push("OPPONENT_NO_DAMAGING_MOVE");
    return;
  }
  if (result.selected.typeMultiplier >= 2) {
    reasons.push("TAKES_SUPER_EFFECTIVE_DAMAGE");
  } else if (result.selected.typeMultiplier <= 0.5) {
    reasons.push("RESISTS_THREAT");
  }
}

function calculateTypeOnlyMatchupScore(input: MatchupScoreInput): MatchupScore {
  const outgoing = evaluateMovesByType(input.self, input.opponent);
  const incoming = evaluateMovesByType(input.opponent, input.self);
  const offensiveScore =
    outgoing.selected === null ? 0 : scoreOffensiveTypeMultiplier(outgoing.selected.typeMultiplier);
  const defensiveScore =
    incoming.selected === null
      ? 30
      : scoreDefensiveTypeMultiplier(incoming.selected.typeMultiplier);
  const damageRaceScore = 0;
  const totalScore = normalizeMatchupScore(offensiveScore, defensiveScore, damageRaceScore);
  const classification = classifyMatchupScore(totalScore);
  const reasonCodes: MatchupReasonCode[] = [];
  appendTypeOnlyOffensiveReasons(reasonCodes, outgoing);
  appendTypeOnlyDefensiveReasons(reasonCodes, incoming);

  return {
    selfPokemonId: input.self.pokemonId,
    myPokemonId: input.self.pokemonId,
    opponentPokemonId: input.opponent.pokemonId,
    offensiveScore,
    defensiveScore,
    damageRaceScore,
    totalScore,
    classification,
    calculationMode: "type_only",
    bestOffensiveMoveId: outgoing.selected?.moveId ?? null,
    mostThreateningMoveId: incoming.selected?.moveId ?? null,
    outgoingDamage: null,
    incomingDamage: null,
    outgoingKnockoutCount: null,
    incomingKnockoutCount: null,
    offensiveTypeMultiplier: outgoing.selected?.typeMultiplier ?? null,
    defensiveTypeMultiplier: incoming.selected?.typeMultiplier ?? null,
    reasonCodes,
    score: totalScore,
    verdict: classification,
    breakdown: {
      offense: offensiveScore,
      defense: defensiveScore,
      speed: 0,
      damageRace: 0,
      priority: 0,
      statusResist: 0,
      setupCounter: 0,
    },
  };
}

/**
 * 自分側と相手側の実技から攻防相性・確定数レースを統合する。
 * 技採用率による事前選択は行わず、呼び出し側が渡した技配列だけを評価する。
 */
export function calculateMatchupScore(input: MatchupScoreInput): MatchupScore {
  assertLevel(input.selfLevel, "selfLevel");
  assertLevel(input.opponentLevel, "opponentLevel");
  assertCombatant(input.self, "self");
  assertCombatant(input.opponent, "opponent");
  if (input.self.stats === null || input.opponent.stats === null) {
    return calculateTypeOnlyMatchupScore(input);
  }

  const outgoing = evaluateMoves(input.self, input.selfLevel, input.opponent);
  const incoming = evaluateMoves(input.opponent, input.opponentLevel, input.self);

  const offensiveScore =
    outgoing.selected === null
      ? 0
      : scoreOffensiveTypeMultiplier(outgoing.selected.damage.typeMultiplier);
  const defensiveScore =
    incoming.selected === null
      ? 30
      : scoreDefensiveTypeMultiplier(incoming.selected.damage.typeMultiplier);
  const outgoingKnockoutCount = outgoing.selected?.knockoutCount ?? null;
  const incomingKnockoutCount = incoming.selected?.knockoutCount ?? null;
  const damageRaceScore = calculateDamageRaceScore(outgoingKnockoutCount, incomingKnockoutCount);
  const totalScore = normalizeMatchupScore(offensiveScore, defensiveScore, damageRaceScore);
  const classification = classifyMatchupScore(totalScore);
  const reasonCodes: MatchupReasonCode[] = [];

  appendOffensiveReasons(reasonCodes, outgoing);
  appendDefensiveReasons(reasonCodes, incoming);
  reasonCodes.push(
    damageRaceScore > 0
      ? "WINS_DAMAGE_RACE"
      : damageRaceScore < 0
        ? "LOSES_DAMAGE_RACE"
        : "EVEN_DAMAGE_RACE",
  );

  return {
    selfPokemonId: input.self.pokemonId,
    myPokemonId: input.self.pokemonId,
    opponentPokemonId: input.opponent.pokemonId,
    offensiveScore,
    defensiveScore,
    damageRaceScore,
    totalScore,
    classification,
    calculationMode: "full",
    bestOffensiveMoveId: outgoing.selected?.damage.moveId ?? null,
    mostThreateningMoveId: incoming.selected?.damage.moveId ?? null,
    outgoingDamage: outgoing.selected?.damage ?? null,
    incomingDamage: incoming.selected?.damage ?? null,
    outgoingKnockoutCount,
    incomingKnockoutCount,
    offensiveTypeMultiplier: outgoing.selected?.damage.typeMultiplier ?? null,
    defensiveTypeMultiplier: incoming.selected?.damage.typeMultiplier ?? null,
    reasonCodes,
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
