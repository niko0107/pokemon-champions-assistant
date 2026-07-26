import {
  MOVE_CATEGORIES,
  MOVE_POWER_MAX,
  MOVE_POWER_MIN,
  POKEMON_TYPES,
} from "@pokemon-champions/shared";
import { getCombinedTypeEffectiveness } from "./type-effectiveness";
import type {
  DamageCalculationInput,
  DamageRangeResult,
  DefensiveTyping,
  KnockoutClassification,
  KnockoutCountInput,
  KnockoutCountResult,
  StabMultiplier,
  TypeEffectivenessMultiplier,
  TypeName,
} from "./types";

export const DAMAGE_LEVEL_MIN = 1;
export const DAMAGE_LEVEL_MAX = 100;
export const DAMAGE_PERCENT_DECIMAL_PLACES = 2;

const POKEMON_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);
const MOVE_CATEGORY_SET: ReadonlySet<string> = new Set(MOVE_CATEGORIES);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const TYPE_MULTIPLIER_FRACTIONS: Readonly<
  Record<TypeEffectivenessMultiplier, readonly [numerator: bigint, denominator: bigint]>
> = {
  0: [0n, 1n],
  0.25: [1n, 4n],
  0.5: [1n, 2n],
  1: [1n, 1n],
  2: [2n, 1n],
  4: [4n, 1n],
};

function assertSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${path} must be a safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, path: string): void {
  assertSafeInteger(value, path);
  if (value <= 0) {
    throw new RangeError(`${path} must be greater than 0`);
  }
}

function assertNonNegativeSafeInteger(value: number, path: string): void {
  assertSafeInteger(value, path);
  if (value < 0) {
    throw new RangeError(`${path} must be greater than or equal to 0`);
  }
}

function assertPokemonType(value: TypeName, path: string): void {
  if (!POKEMON_TYPE_SET.has(value)) {
    throw new RangeError(`${path} must be a supported Pokemon type`);
  }
}

function assertTyping(typing: DefensiveTyping, path: string): void {
  assertPokemonType(typing.type1, `${path}.type1`);
  if (typing.type2 !== null) {
    assertPokemonType(typing.type2, `${path}.type2`);
    if (typing.type1 === typing.type2) {
      throw new RangeError(`${path}.type2 must differ from ${path}.type1`);
    }
  }
}

function assertCalculationInput(input: DamageCalculationInput): void {
  assertPositiveSafeInteger(input.attacker.pokemonId, "attacker.pokemonId");
  assertPositiveSafeInteger(input.attacker.level, "attacker.level");
  if (input.attacker.level < DAMAGE_LEVEL_MIN || input.attacker.level > DAMAGE_LEVEL_MAX) {
    throw new RangeError(
      `attacker.level must be between ${DAMAGE_LEVEL_MIN} and ${DAMAGE_LEVEL_MAX}`,
    );
  }
  assertPositiveSafeInteger(input.attacker.attack, "attacker.attack");
  assertPositiveSafeInteger(input.attacker.specialAttack, "attacker.specialAttack");
  assertTyping(input.attacker, "attacker");

  assertPositiveSafeInteger(input.defender.pokemonId, "defender.pokemonId");
  assertPositiveSafeInteger(input.defender.hp, "defender.hp");
  assertPositiveSafeInteger(input.defender.defense, "defender.defense");
  assertPositiveSafeInteger(input.defender.specialDefense, "defender.specialDefense");
  assertTyping(input.defender, "defender");

  assertPositiveSafeInteger(input.move.moveId, "move.moveId");
  assertPokemonType(input.move.type, "move.type");
  if (!MOVE_CATEGORY_SET.has(input.move.category)) {
    throw new RangeError("move.category must be physical, special, or status");
  }

  if (input.move.category === "status") {
    if (input.move.power !== null) {
      throw new RangeError("status move power must be null");
    }
    return;
  }

  if (input.move.power === null) {
    throw new RangeError("damaging move power must not be null");
  }
  assertSafeInteger(input.move.power, "move.power");
  if (input.move.power < MOVE_POWER_MIN || input.move.power > MOVE_POWER_MAX) {
    throw new RangeError(`move.power must be between ${MOVE_POWER_MIN} and ${MOVE_POWER_MAX}`);
  }
}

function toSafeNumber(value: bigint, path: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new RangeError(`${path} exceeds the safe integer range`);
  }
  return Number(value);
}

function ceilDivide(dividend: number, divisor: number): number {
  const result = (BigInt(dividend) + BigInt(divisor) - 1n) / BigInt(divisor);
  return toSafeNumber(result, "knockout count");
}

function classifyKnockout(
  guaranteedCount: number | null,
  possibleCount: number,
): KnockoutClassification {
  const isGuaranteed = guaranteedCount === possibleCount;
  if (possibleCount === 1) {
    return isGuaranteed ? "guaranteed_one_hit" : "possible_one_hit";
  }
  if (possibleCount === 2) {
    return isGuaranteed ? "guaranteed_two_hit" : "possible_two_hit";
  }
  return isGuaranteed ? "guaranteed_three_plus_hits" : "possible_three_plus_hits";
}

/**
 * ダメージ範囲から確定数を算出する。
 * knockoutCountは下限ダメージ、possibleKnockoutCountは上限ダメージを使う。
 */
export function calculateKnockoutCount(input: KnockoutCountInput): KnockoutCountResult {
  assertPositiveSafeInteger(input.defenderHp, "defenderHp");
  assertNonNegativeSafeInteger(input.minDamage, "minDamage");
  assertNonNegativeSafeInteger(input.maxDamage, "maxDamage");
  if (input.minDamage > input.maxDamage) {
    throw new RangeError("minDamage must be less than or equal to maxDamage");
  }

  if (input.maxDamage === 0) {
    return {
      knockoutCount: null,
      possibleKnockoutCount: null,
      knockoutClassification: "cannot_ko",
    };
  }

  const possibleKnockoutCount = ceilDivide(input.defenderHp, input.maxDamage);
  const knockoutCount =
    input.minDamage === 0 ? null : ceilDivide(input.defenderHp, input.minDamage);

  return {
    knockoutCount,
    possibleKnockoutCount,
    knockoutClassification: classifyKnockout(knockoutCount, possibleKnockoutCount),
  };
}

function calculateBaseDamage(
  level: number,
  power: number,
  attackerStat: number,
  defenderStat: number,
): bigint {
  const levelFactor = (2n * BigInt(level)) / 5n + 2n;
  const scaledDamage = (levelFactor * BigInt(power) * BigInt(attackerStat)) / BigInt(defenderStat);
  return scaledDamage / 50n + 2n;
}

function applyDamageModifiers(
  baseDamage: bigint,
  stabMultiplier: StabMultiplier,
  typeMultiplier: TypeEffectivenessMultiplier,
): bigint {
  const [typeNumerator, typeDenominator] = TYPE_MULTIPLIER_FRACTIONS[typeMultiplier];
  const stabNumerator = stabMultiplier === 1.5 ? 3n : 1n;
  const stabDenominator = stabMultiplier === 1.5 ? 2n : 1n;
  return (baseDamage * stabNumerator * typeNumerator) / (stabDenominator * typeDenominator);
}

function calculateDamagePercent(damage: number, defenderHp: number): number {
  const scale = 10 ** DAMAGE_PERCENT_DECIMAL_PLACES;
  const scaledPercent =
    (BigInt(damage) * BigInt(100 * scale) + BigInt(defenderHp) / 2n) / BigInt(defenderHp);
  return toSafeNumber(scaledPercent, "damage percent") / scale;
}

/**
 * PRODUCT_SPEC §9.3の簡易式でダメージと確定数を返す。
 * 現行仕様は乱数を考慮しないため、minDamageとmaxDamageは常に同値になる。
 */
export function calculateDamageRange(input: DamageCalculationInput): DamageRangeResult {
  assertCalculationInput(input);

  const typeMultiplier = getCombinedTypeEffectiveness(input.move.type, {
    type1: input.defender.type1,
    type2: input.defender.type2,
  });

  if (input.move.category === "status") {
    return {
      moveId: input.move.moveId,
      category: input.move.category,
      minDamage: 0,
      maxDamage: 0,
      minDamagePercent: 0,
      maxDamagePercent: 0,
      typeMultiplier,
      stabMultiplier: 1,
      attackerStat: null,
      defenderStat: null,
      canDamage: false,
      isImmune: false,
      ...calculateKnockoutCount({
        defenderHp: input.defender.hp,
        minDamage: 0,
        maxDamage: 0,
      }),
    };
  }

  const attackerStat =
    input.move.category === "physical" ? input.attacker.attack : input.attacker.specialAttack;
  const defenderStat =
    input.move.category === "physical" ? input.defender.defense : input.defender.specialDefense;
  const stabMultiplier: StabMultiplier =
    input.move.type === input.attacker.type1 || input.move.type === input.attacker.type2 ? 1.5 : 1;
  const power = input.move.power;
  if (power === null) {
    throw new RangeError("damaging move power must not be null");
  }
  const baseDamage = calculateBaseDamage(input.attacker.level, power, attackerStat, defenderStat);
  const damage = toSafeNumber(
    applyDamageModifiers(baseDamage, stabMultiplier, typeMultiplier),
    "damage",
  );
  const knockout = calculateKnockoutCount({
    defenderHp: input.defender.hp,
    minDamage: damage,
    maxDamage: damage,
  });

  return {
    moveId: input.move.moveId,
    category: input.move.category,
    minDamage: damage,
    maxDamage: damage,
    minDamagePercent: calculateDamagePercent(damage, input.defender.hp),
    maxDamagePercent: calculateDamagePercent(damage, input.defender.hp),
    typeMultiplier,
    stabMultiplier,
    attackerStat,
    defenderStat,
    canDamage: damage > 0,
    isImmune: typeMultiplier === 0,
    ...knockout,
  };
}
