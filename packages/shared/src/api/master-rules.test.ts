import { describe, expect, it } from "vitest";
import { masterRuleSchema, masterRulesResponseSchema } from "./master-rules";

const rule = {
  id: 1,
  name: "シングル",
  teamSize: 6,
  pickSize: 3,
  battleLevel: 50,
};

describe("MASTER-010 public Rule schemas", () => {
  it("Party作成に必要なRule項目だけを受理する", () => {
    expect(masterRuleSchema.parse(rule)).toEqual(rule);
    expect(masterRulesResponseSchema.parse({ items: [rule] })).toEqual({ items: [rule] });
  });

  it("0件の一覧を受理する", () => {
    expect(masterRulesResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it("Ruleとレスポンスの余分な内部情報を拒否する", () => {
    expect(masterRuleSchema.safeParse({ ...rule, createdAt: "2026-07-26" }).success).toBe(false);
    expect(masterRulesResponseSchema.safeParse({ items: [rule], userId: "internal" }).success).toBe(
      false,
    );
  });

  it.each([
    ["IDが不正", { ...rule, id: 0 }],
    ["名前が空", { ...rule, name: " " }],
    ["teamSizeが範囲外", { ...rule, teamSize: 7 }],
    ["pickSizeがteamSizeを超過", { ...rule, teamSize: 3, pickSize: 4 }],
    ["battleLevelが範囲外", { ...rule, battleLevel: 101 }],
  ])("%sのRuleを拒否する", (_label, input) => {
    expect(masterRuleSchema.safeParse(input).success).toBe(false);
  });
});
