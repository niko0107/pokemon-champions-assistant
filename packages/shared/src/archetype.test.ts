import { describe, expect, it } from "vitest";
import {
  archetypeDefaultLeadsSchema,
  archetypeEvsSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
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

  it("順序を維持した重複なしの基本選出slotを受理する", () => {
    expect(archetypeDefaultLeadsSchema.parse([2, 5, 1])).toEqual([2, 5, 1]);
  });

  it.each([
    ["空配列", []],
    ["重複", [1, 1]],
    ["範囲外", [0, 2]],
    ["7枠超", [1, 2, 3, 4, 5, 6, 6]],
  ])("不正な基本選出（%s）を拒否する", (_label, slots) => {
    expect(archetypeDefaultLeadsSchema.safeParse(slots).success).toBe(false);
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
});
