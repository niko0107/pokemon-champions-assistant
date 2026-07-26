import {
  POKEMON_TYPES,
  TYPE_EFFECTIVENESS_CHART,
  type BaseTypeEffectivenessMultiplier,
} from "@pokemon-champions/shared";
import type {
  DefensiveTypeProfile,
  DefensiveTyping,
  OffensiveTypeProfile,
  TypeEffectivenessMultiplier,
  TypeName,
} from "./types";

const POKEMON_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);
const COMBINED_MULTIPLIERS: ReadonlySet<number> = new Set([0, 0.25, 0.5, 1, 2, 4]);

function assertPokemonType(type: TypeName, path: string): void {
  if (!POKEMON_TYPE_SET.has(type)) {
    throw new RangeError(`${path} must be a supported Pokemon type`);
  }
}

function assertDefensiveTyping(typing: DefensiveTyping): void {
  assertPokemonType(typing.type1, "defense.type1");
  if (typing.type2 !== null) {
    assertPokemonType(typing.type2, "defense.type2");
    if (typing.type2 === typing.type1) {
      throw new RangeError("defense.type2 must differ from defense.type1");
    }
  }
}

function assertCombinedMultiplier(value: number): asserts value is TypeEffectivenessMultiplier {
  if (!COMBINED_MULTIPLIERS.has(value)) {
    throw new RangeError("combined type effectiveness produced an unsupported multiplier");
  }
}

/** 攻撃タイプ1つと防御タイプ1つの基本倍率を返す。 */
export function getTypeEffectiveness(
  attackType: TypeName,
  defenseType: TypeName,
): BaseTypeEffectivenessMultiplier {
  assertPokemonType(attackType, "attackType");
  assertPokemonType(defenseType, "defenseType");
  return TYPE_EFFECTIVENESS_CHART[attackType][defenseType];
}

/** 防御タイプを先に指定したい呼び出し側向けの同値な参照関数。 */
export function getDefensiveEffectiveness(
  defenseType: TypeName,
  attackType: TypeName,
): BaseTypeEffectivenessMultiplier {
  return getTypeEffectiveness(attackType, defenseType);
}

/**
 * 単一・複合防御タイプに対する攻撃倍率を返す。
 * 基本倍率は0・0.5・1・2だけなので、乗算結果も2進小数として誤差なく表現できる。
 */
export function getCombinedTypeEffectiveness(
  attackType: TypeName,
  defense: DefensiveTyping,
): TypeEffectivenessMultiplier {
  assertPokemonType(attackType, "attackType");
  assertDefensiveTyping(defense);

  const type1Multiplier = getTypeEffectiveness(attackType, defense.type1);
  const type2Multiplier =
    defense.type2 === null ? 1 : getTypeEffectiveness(attackType, defense.type2);
  const combinedMultiplier = type1Multiplier * type2Multiplier;
  assertCombinedMultiplier(combinedMultiplier);
  return combinedMultiplier;
}

/** 防御タイプ構成を、全18攻撃タイプから受ける最終倍率ごとに分類する。 */
export function getDefensiveTypeProfile(defense: DefensiveTyping): DefensiveTypeProfile {
  assertDefensiveTyping(defense);

  const profile: DefensiveTypeProfile = {
    quadrupleWeaknesses: [],
    weaknesses: [],
    neutral: [],
    resistances: [],
    quarterResistances: [],
    immunities: [],
  };

  for (const attackType of POKEMON_TYPES) {
    const multiplier = getCombinedTypeEffectiveness(attackType, defense);
    switch (multiplier) {
      case 4:
        profile.quadrupleWeaknesses.push(attackType);
        break;
      case 2:
        profile.weaknesses.push(attackType);
        break;
      case 1:
        profile.neutral.push(attackType);
        break;
      case 0.5:
        profile.resistances.push(attackType);
        break;
      case 0.25:
        profile.quarterResistances.push(attackType);
        break;
      case 0:
        profile.immunities.push(attackType);
        break;
    }
  }

  return profile;
}

/** 攻撃タイプ1つを、全18単一防御タイプへの基本倍率ごとに分類する。 */
export function getOffensiveTypeProfile(attackType: TypeName): OffensiveTypeProfile {
  assertPokemonType(attackType, "attackType");

  const profile: OffensiveTypeProfile = {
    superEffective: [],
    neutral: [],
    notVeryEffective: [],
    noEffect: [],
  };

  for (const defenseType of POKEMON_TYPES) {
    const multiplier = getTypeEffectiveness(attackType, defenseType);
    switch (multiplier) {
      case 2:
        profile.superEffective.push(defenseType);
        break;
      case 1:
        profile.neutral.push(defenseType);
        break;
      case 0.5:
        profile.notVeryEffective.push(defenseType);
        break;
      case 0:
        profile.noEffect.push(defenseType);
        break;
    }
  }

  return profile;
}
