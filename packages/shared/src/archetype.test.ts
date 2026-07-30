import { describe, expect, it } from "vitest";
import {
  archetypeDefaultLeadsForPickSizeSchema,
  archetypeDefaultLeadsSchema,
  archetypeEvsSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
  archetypeStatPointsSchema,
  archetypeStatusSchema,
} from "./archetype";

describe("ARCHETYPE-001 shared schemas", () => {
  it("人気度・公開状態・ポケモン役割の許可値を受理する", () => {
    expect(archetypePopularityTierSchema.parse("high")).toBe("high");
    expect(archetypeStatusSchema.parse("published")).toBe("published");
    expect(archetypePokemonRoleSchema.parse("sweeper")).toBe("sweeper");
    expect(archetypePopularityTierSchema.safeParse("unknown").success).toBe(false);
    expect(archetypeStatusSchema.safeParse("draft").success).toBe(false);
    expect(archetypePokemonRoleSchema.safeParse("ace").success).toBe(false);
  });

  it("空配列または順序を維持した重複なしの基本選出slotを受理する", () => {
    expect(archetypeDefaultLeadsSchema.parse([])).toEqual([]);
    expect(archetypeDefaultLeadsSchema.parse([2, 5, 1])).toEqual([2, 5, 1]);
  });

  it.each([
    ["重複", [1, 1]],
    ["範囲外", [0, 2]],
    ["7枠超", [1, 2, 3, 4, 5, 6, 6]],
    ["小数", [1.5]],
    ["NaN", [Number.NaN]],
    ["Infinity", [Number.POSITIVE_INFINITY]],
  ])("不正な基本選出（%s）を拒否する", (_label, slots) => {
    expect(archetypeDefaultLeadsSchema.safeParse(slots).success).toBe(false);
  });

  it("Rule.pickSize取得後は空配列または同じ件数だけを受理する", () => {
    const singlesDefaultLeadsSchema = archetypeDefaultLeadsForPickSizeSchema(3);

    expect(singlesDefaultLeadsSchema.parse([])).toEqual([]);
    expect(singlesDefaultLeadsSchema.parse([1, 2, 3])).toEqual([1, 2, 3]);
    expect(singlesDefaultLeadsSchema.safeParse([1]).success).toBe(false);
    expect(singlesDefaultLeadsSchema.safeParse([1, 2]).success).toBe(false);
    expect(singlesDefaultLeadsSchema.safeParse([1, 2, 3, 4]).success).toBe(false);
  });

  it("空または重複しない正の代替持ち物IDを受理する", () => {
    expect(archetypeItemAlternativeIdsSchema.parse([])).toEqual([]);
    expect(archetypeItemAlternativeIdsSchema.parse([3, 8])).toEqual([3, 8]);
    expect(archetypeItemAlternativeIdsSchema.safeParse([3, 3]).success).toBe(false);
    expect(archetypeItemAlternativeIdsSchema.safeParse([0]).success).toBe(false);
  });

  it("各能力252以下・合計510以下の努力値を受理する", () => {
    const evs = { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 };
    expect(archetypeEvsSchema.parse(evs)).toEqual(evs);
  });

  it("能力ごとの上限超過・合計超過・不足フィールドを拒否する", () => {
    expect(
      archetypeEvsSchema.safeParse({
        hp: 253,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
      }).success,
    ).toBe(false);
    expect(
      archetypeEvsSchema.safeParse({
        hp: 252,
        atk: 252,
        def: 252,
        spa: 0,
        spd: 0,
        spe: 0,
      }).success,
    ).toBe(false);
    expect(archetypeEvsSchema.safeParse({ hp: 252 }).success).toBe(false);
  });

  it("能力ポイントは全0と合計66以下を受理し、入力を変更しない", () => {
    const allZero = {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    };
    const total66 = {
      hp: 32,
      attack: 32,
      defense: 2,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    };
    const before = structuredClone(total66);

    expect(archetypeStatPointsSchema.parse(allZero)).toEqual(allZero);
    expect(archetypeStatPointsSchema.parse(total66)).toEqual(total66);
    expect(total66).toEqual(before);
  });

  it.each(["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"] as const)(
    "能力ポイントの%sは32を受理する",
    (stat) => {
      const statPoints = {
        hp: 0,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
        [stat]: 32,
      };

      expect(archetypeStatPointsSchema.parse(statPoints)[stat]).toBe(32);
    },
  );

  it.each([
    ["33", { hp: 33, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }],
    ["負数", { hp: -1, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }],
    ["小数", { hp: 0.5, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }],
    [
      "NaN",
      { hp: Number.NaN, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    ],
    [
      "Infinity",
      {
        hp: Number.POSITIVE_INFINITY,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
      },
    ],
    ["合計67", { hp: 32, attack: 32, defense: 3, specialAttack: 0, specialDefense: 0, speed: 0 }],
    ["キー不足", { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0 }],
    [
      "余分なキー",
      {
        hp: 0,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
        extra: 0,
      },
    ],
  ])("不正な能力ポイント（%s）を拒否する", (_label, statPoints) => {
    expect(archetypeStatPointsSchema.safeParse(statPoints).success).toBe(false);
  });

  it("能力ポイントのnullable契約はnullを受理する", () => {
    expect(archetypeStatPointsSchema.nullable().parse(null)).toBeNull();
  });
});
