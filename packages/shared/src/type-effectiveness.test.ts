import { describe, expect, it } from "vitest";
import { POKEMON_TYPES, type PokemonType } from "./enums";
import {
  TYPE_EFFECTIVENESS_CHART,
  type BaseTypeEffectivenessMultiplier,
} from "./type-effectiveness";

interface ExpectedNonNeutralMatchups {
  superEffective: readonly PokemonType[];
  notVeryEffective: readonly PokemonType[];
  noEffect: readonly PokemonType[];
}

const EXPECTED_NON_NEUTRAL_MATCHUPS: Readonly<Record<PokemonType, ExpectedNonNeutralMatchups>> = {
  normal: {
    superEffective: [],
    notVeryEffective: ["rock", "steel"],
    noEffect: ["ghost"],
  },
  fire: {
    superEffective: ["grass", "ice", "bug", "steel"],
    notVeryEffective: ["fire", "water", "rock", "dragon"],
    noEffect: [],
  },
  water: {
    superEffective: ["fire", "ground", "rock"],
    notVeryEffective: ["water", "grass", "dragon"],
    noEffect: [],
  },
  electric: {
    superEffective: ["water", "flying"],
    notVeryEffective: ["electric", "grass", "dragon"],
    noEffect: ["ground"],
  },
  grass: {
    superEffective: ["water", "ground", "rock"],
    notVeryEffective: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
    noEffect: [],
  },
  ice: {
    superEffective: ["grass", "ground", "flying", "dragon"],
    notVeryEffective: ["fire", "water", "ice", "steel"],
    noEffect: [],
  },
  fighting: {
    superEffective: ["normal", "ice", "rock", "dark", "steel"],
    notVeryEffective: ["poison", "flying", "psychic", "bug", "fairy"],
    noEffect: ["ghost"],
  },
  poison: {
    superEffective: ["grass", "fairy"],
    notVeryEffective: ["poison", "ground", "rock", "ghost"],
    noEffect: ["steel"],
  },
  ground: {
    superEffective: ["fire", "electric", "poison", "rock", "steel"],
    notVeryEffective: ["grass", "bug"],
    noEffect: ["flying"],
  },
  flying: {
    superEffective: ["grass", "fighting", "bug"],
    notVeryEffective: ["electric", "rock", "steel"],
    noEffect: [],
  },
  psychic: {
    superEffective: ["fighting", "poison"],
    notVeryEffective: ["psychic", "steel"],
    noEffect: ["dark"],
  },
  bug: {
    superEffective: ["grass", "psychic", "dark"],
    notVeryEffective: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
    noEffect: [],
  },
  rock: {
    superEffective: ["fire", "ice", "flying", "bug"],
    notVeryEffective: ["fighting", "ground", "steel"],
    noEffect: [],
  },
  ghost: {
    superEffective: ["psychic", "ghost"],
    notVeryEffective: ["dark"],
    noEffect: ["normal"],
  },
  dragon: {
    superEffective: ["dragon"],
    notVeryEffective: ["steel"],
    noEffect: ["fairy"],
  },
  dark: {
    superEffective: ["psychic", "ghost"],
    notVeryEffective: ["fighting", "dark", "fairy"],
    noEffect: [],
  },
  steel: {
    superEffective: ["ice", "rock", "fairy"],
    notVeryEffective: ["fire", "water", "electric", "steel"],
    noEffect: [],
  },
  fairy: {
    superEffective: ["fighting", "dragon", "dark"],
    notVeryEffective: ["fire", "poison", "steel"],
    noEffect: [],
  },
};

function expectedMultiplier(
  attackType: PokemonType,
  defenseType: PokemonType,
): BaseTypeEffectivenessMultiplier {
  const expected = EXPECTED_NON_NEUTRAL_MATCHUPS[attackType];
  if (expected.superEffective.includes(defenseType)) {
    return 2;
  }
  if (expected.notVeryEffective.includes(defenseType)) {
    return 0.5;
  }
  if (expected.noEffect.includes(defenseType)) {
    return 0;
  }
  return 1;
}

describe("TYPE_EFFECTIVENESS_CHART", () => {
  it("sharedの18タイプを重複なく決定的な順序で定義する", () => {
    expect(POKEMON_TYPES).toHaveLength(18);
    expect(new Set(POKEMON_TYPES)).toHaveLength(18);
    expect(POKEMON_TYPES).toEqual([
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
      "dark",
      "steel",
      "fairy",
    ]);
  });

  it("全攻撃タイプ×全防御タイプを明示し、許可された基本倍率だけを持つ", () => {
    expect(Object.keys(TYPE_EFFECTIVENESS_CHART)).toEqual(POKEMON_TYPES);

    for (const attackType of POKEMON_TYPES) {
      const row = TYPE_EFFECTIVENESS_CHART[attackType];
      expect(Object.keys(row)).toEqual(POKEMON_TYPES);
      expect(Object.values(row)).toHaveLength(POKEMON_TYPES.length);

      for (const defenseType of POKEMON_TYPES) {
        expect(row[defenseType]).toBe(expectedMultiplier(attackType, defenseType));
        expect([0, 0.5, 1, 2]).toContain(row[defenseType]);
      }
    }
  });

  it("外部から基本表と各行を変更できない", () => {
    expect(Object.isFrozen(TYPE_EFFECTIVENESS_CHART)).toBe(true);
    for (const attackType of POKEMON_TYPES) {
      expect(Object.isFrozen(TYPE_EFFECTIVENESS_CHART[attackType])).toBe(true);
    }
  });
});
