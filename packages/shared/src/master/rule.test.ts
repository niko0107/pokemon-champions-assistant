import { describe, expect, it } from "vitest";
import { ruleMasterSchema } from "./rule";

describe("ruleMasterSchema", () => {
  it.each([
    { name: "シングル", teamSize: 6, pickSize: 3, battleLevel: 50 },
    { name: "フルバトル", teamSize: 6, pickSize: 6, battleLevel: 100 },
    { name: "1対1", teamSize: 1, pickSize: 1, battleLevel: 1 },
  ])("$nameの人数を受理する", (rule) => {
    expect(ruleMasterSchema.parse(rule)).toEqual(rule);
  });

  it.each([
    { label: "teamSizeが0", override: { teamSize: 0 } },
    { label: "teamSizeが7", override: { teamSize: 7 } },
    { label: "pickSizeが0", override: { pickSize: 0 } },
    { label: "pickSizeが7", override: { pickSize: 7 } },
    { label: "人数が小数", override: { pickSize: 3.5 } },
    { label: "選出人数超過", override: { teamSize: 3, pickSize: 4 } },
    { label: "空のルール名", override: { name: " " } },
    { label: "battleLevelが0", override: { battleLevel: 0 } },
    { label: "battleLevelが101", override: { battleLevel: 101 } },
    { label: "battleLevelが小数", override: { battleLevel: 50.5 } },
    { label: "battleLevelがNaN", override: { battleLevel: Number.NaN } },
    {
      label: "battleLevelがInfinity",
      override: { battleLevel: Number.POSITIVE_INFINITY },
    },
  ])("$labelを拒否する", ({ override }) => {
    expect(
      ruleMasterSchema.safeParse({
        name: "テストルール",
        teamSize: 6,
        pickSize: 3,
        battleLevel: 50,
        ...override,
      }).success,
    ).toBe(false);
  });
});
