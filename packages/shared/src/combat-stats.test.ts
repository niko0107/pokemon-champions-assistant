import { describe, expect, it } from "vitest";
import { combatActualStatsSchema } from "./combat-stats";

const validStats = {
  hp: 200,
  attack: 120,
  defense: 150,
  specialAttack: 100,
  specialDefense: 130,
  speed: 110,
};

describe("combatActualStatsSchema", () => {
  it("確定済みの6能力を受理する", () => {
    expect(combatActualStatsSchema.parse(validStats)).toEqual(validStats);
  });

  it.each([
    ["0", { ...validStats, hp: 0 }],
    ["負数", { ...validStats, attack: -1 }],
    ["小数", { ...validStats, defense: 1.5 }],
    ["NaN", { ...validStats, specialAttack: Number.NaN }],
    ["Infinity", { ...validStats, specialDefense: Number.POSITIVE_INFINITY }],
    ["キー不足", { ...validStats, speed: undefined }],
    ["余分なキー", { ...validStats, baseHp: 100 }],
  ])("%sを拒否する", (_label, input) => {
    expect(combatActualStatsSchema.safeParse(input).success).toBe(false);
  });
});
