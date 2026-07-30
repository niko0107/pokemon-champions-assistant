import { describe, expect, it } from "vitest";
import { archetypeIvsSchema, completeArchetypeIvsSchema } from "./archetype";
import { calculatePokemonActualStats } from "./stat-calculation";

const input = {
  baseStats: {
    hp: 95,
    attack: 125,
    defense: 79,
    specialAttack: 60,
    specialDefense: 100,
    speed: 81,
  },
  evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  level: 50,
  nature: "いじっぱり",
} as const;

describe("ARCHETYPE-004B stat calculation", () => {
  it("明示された全材料から決定的に実数値を算出する", () => {
    expect(calculatePokemonActualStats(input)).toEqual({
      hp: 202,
      attack: 194,
      defense: 99,
      specialAttack: 72,
      specialDefense: 121,
      speed: 101,
    });
    expect(calculatePokemonActualStats(input)).toEqual(calculatePokemonActualStats(input));
  });

  it("未知の性格・不正レベル・不正種族値を補完せず拒否する", () => {
    expect(() => calculatePokemonActualStats({ ...input, nature: "未確認" })).toThrow(RangeError);
    expect(() => calculatePokemonActualStats({ ...input, level: 0 })).toThrow(RangeError);
    expect(() =>
      calculatePokemonActualStats({
        ...input,
        baseStats: { ...input.baseStats, hp: Number.NaN },
      }),
    ).toThrow(RangeError);
  });

  it("部分IVはnullを保持し、完全IV契約とは区別する", () => {
    const partial = { ...input.ivs, atk: null };
    expect(archetypeIvsSchema.parse(partial).atk).toBeNull();
    expect(completeArchetypeIvsSchema.safeParse(partial).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 32])("不正IV %sを拒否する", (value) => {
    expect(archetypeIvsSchema.safeParse({ ...input.ivs, spe: value }).success).toBe(false);
  });
});
