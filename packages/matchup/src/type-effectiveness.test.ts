import { POKEMON_TYPES } from "@pokemon-champions/shared";
import { describe, expect, it } from "vitest";
import {
  getCombinedTypeEffectiveness,
  getDefensiveEffectiveness,
  getDefensiveTypeProfile,
  getOffensiveTypeProfile,
  getTypeEffectiveness,
} from "./type-effectiveness";
import type { DefensiveTyping, TypeName } from "./types";

describe("getTypeEffectiveness", () => {
  it("2倍・0.5倍・1倍・0倍と非対称な相性を返す", () => {
    expect(getTypeEffectiveness("fire", "grass")).toBe(2);
    expect(getTypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getTypeEffectiveness("normal", "water")).toBe(1);
    expect(getTypeEffectiveness("electric", "ground")).toBe(0);
    expect(getTypeEffectiveness("water", "fire")).toBe(2);
    expect(getTypeEffectiveness("fire", "water")).not.toBe(2);
  });

  it("防御タイプ先行の関数でも同じ基本倍率を返す", () => {
    for (const attackType of POKEMON_TYPES) {
      for (const defenseType of POKEMON_TYPES) {
        expect(getDefensiveEffectiveness(defenseType, attackType)).toBe(
          getTypeEffectiveness(attackType, defenseType),
        );
      }
    }
  });

  it("実行時に許可外のタイプが渡された場合は黙って1倍にしない", () => {
    expect(() => Reflect.apply(getTypeEffectiveness, undefined, ["stellar", "water"])).toThrowError(
      /supported Pokemon type/,
    );
    expect(() => Reflect.apply(getTypeEffectiveness, undefined, ["fire", "stellar"])).toThrowError(
      /supported Pokemon type/,
    );
  });
});

describe("getCombinedTypeEffectiveness", () => {
  it.each([
    ["ice", { type1: "dragon", type2: "flying" }, 4],
    ["water", { type1: "fire", type2: "flying" }, 2],
    ["electric", { type1: "water", type2: "dragon" }, 1],
    ["fire", { type1: "water", type2: "flying" }, 0.5],
    ["grass", { type1: "fire", type2: "flying" }, 0.25],
    ["electric", { type1: "water", type2: "ground" }, 0],
  ] as const)("%s攻撃と%o防御から許可された複合倍率%sを返す", (attackType, defense, expected) => {
    expect(getCombinedTypeEffectiveness(attackType, defense)).toBe(expected);
  });

  it("type2=nullは単一タイプとして扱う", () => {
    expect(getCombinedTypeEffectiveness("water", { type1: "fire", type2: null })).toBe(2);
  });

  it("無効と弱点が同時に存在する場合は0倍にする", () => {
    expect(
      getCombinedTypeEffectiveness("ground", {
        type1: "electric",
        type2: "flying",
      }),
    ).toBe(0);
  });

  it("type1とtype2の入力順で結果が変わらない", () => {
    for (const attackType of POKEMON_TYPES) {
      expect(
        getCombinedTypeEffectiveness(attackType, {
          type1: "dragon",
          type2: "flying",
        }),
      ).toBe(
        getCombinedTypeEffectiveness(attackType, {
          type1: "flying",
          type2: "dragon",
        }),
      );
    }
  });

  it("DB契約と同じく重複した複合タイプを拒否する", () => {
    expect(() =>
      getCombinedTypeEffectiveness("water", {
        type1: "fire",
        type2: "fire",
      }),
    ).toThrowError(/must differ/);
  });

  it("入力オブジェクトを変更せず同一入力へ決定的な結果を返す", () => {
    const defense = Object.freeze({
      type1: "fire",
      type2: "steel",
    } satisfies DefensiveTyping);

    const first = getCombinedTypeEffectiveness("ground", defense);
    const second = getCombinedTypeEffectiveness("ground", defense);

    expect(first).toBe(4);
    expect(second).toBe(first);
    expect(defense).toEqual({ type1: "fire", type2: "steel" });
  });
});

describe("getDefensiveTypeProfile", () => {
  it("全倍率分類をsharedのタイプ順で返す", () => {
    expect(getDefensiveTypeProfile({ type1: "fire", type2: "steel" })).toEqual({
      quadrupleWeaknesses: ["ground"],
      weaknesses: ["water", "fighting"],
      neutral: ["fire", "electric", "rock", "ghost", "dark"],
      resistances: ["normal", "flying", "psychic", "dragon"],
      quarterResistances: ["grass", "ice", "bug", "steel", "fairy"],
      immunities: ["poison"],
    });
  });

  it("全攻撃タイプを重複なくちょうど1分類へ入れる", () => {
    const profile = getDefensiveTypeProfile({ type1: "water", type2: "ground" });
    const classified = [
      ...profile.quadrupleWeaknesses,
      ...profile.weaknesses,
      ...profile.neutral,
      ...profile.resistances,
      ...profile.quarterResistances,
      ...profile.immunities,
    ];

    expect(classified).toHaveLength(POKEMON_TYPES.length);
    expect(new Set(classified)).toHaveLength(POKEMON_TYPES.length);
    expect([...classified].sort()).toEqual([...POKEMON_TYPES].sort());
    for (const types of Object.values(profile)) {
      expect(types).toEqual(POKEMON_TYPES.filter((type) => types.includes(type)));
    }
  });

  it("返却配列を変更しても内部表と次の結果を壊さない", () => {
    const first = getDefensiveTypeProfile({ type1: "fire", type2: "steel" });
    first.weaknesses.push("normal");
    first.immunities.length = 0;

    const second = getDefensiveTypeProfile({ type1: "fire", type2: "steel" });
    expect(second.weaknesses).toEqual(["water", "fighting"]);
    expect(second.immunities).toEqual(["poison"]);
    expect(getTypeEffectiveness("water", "fire")).toBe(2);
  });
});

describe("getOffensiveTypeProfile", () => {
  it("全単一防御タイプを基本倍率ごとにsharedの順で返す", () => {
    expect(getOffensiveTypeProfile("fire")).toEqual({
      superEffective: ["grass", "ice", "bug", "steel"],
      neutral: [
        "normal",
        "electric",
        "fighting",
        "poison",
        "ground",
        "flying",
        "psychic",
        "ghost",
        "dark",
        "fairy",
      ],
      notVeryEffective: ["fire", "water", "rock", "dragon"],
      noEffect: [],
    });
  });

  it("無効を含め全防御タイプを重複なくちょうど1分類へ入れる", () => {
    const profile = getOffensiveTypeProfile("electric");
    const classified = [
      ...profile.superEffective,
      ...profile.neutral,
      ...profile.notVeryEffective,
      ...profile.noEffect,
    ];

    expect(profile.noEffect).toEqual(["ground"]);
    expect(classified).toHaveLength(POKEMON_TYPES.length);
    expect(new Set(classified)).toHaveLength(POKEMON_TYPES.length);
    expect([...classified].sort()).toEqual([...POKEMON_TYPES].sort());
    for (const types of Object.values(profile)) {
      expect(types).toEqual(POKEMON_TYPES.filter((type) => types.includes(type)));
    }
  });

  it("返却配列の変更が次のプロフィールへ影響しない", () => {
    const first = getOffensiveTypeProfile("normal");
    first.noEffect.push("fairy");

    expect(getOffensiveTypeProfile("normal").noEffect).toEqual(["ghost"]);
  });
});

describe("TypeName", () => {
  it("sharedの許可タイプをそのまま利用する", () => {
    const allTypes: readonly TypeName[] = POKEMON_TYPES;
    expect(allTypes).toEqual(POKEMON_TYPES);
  });
});
