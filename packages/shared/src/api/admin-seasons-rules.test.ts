import { describe, expect, it } from "vitest";
import {
  adminRuleCreateSchema,
  adminRuleListResponseSchema,
  adminRuleSchema,
  adminSeasonArchiveResponseSchema,
  adminSeasonCreateSchema,
  adminSeasonIdParamsSchema,
  adminSeasonListResponseSchema,
  adminSeasonSchema,
} from "./admin-seasons-rules";

describe("ARCHETYPE-003 season admin schemas", () => {
  it("正常なシーズン作成入力をtrimして受理する", () => {
    expect(
      adminSeasonCreateSchema.parse({
        name: " シーズン12 ",
        startsAt: "2026-01-01",
        endsAt: "2026-03-31",
      }),
    ).toEqual({ name: "シーズン12", startsAt: "2026-01-01", endsAt: "2026-03-31" });
  });

  it.each([
    ["終了日が開始日より前", { name: "S", startsAt: "2026-03-31", endsAt: "2026-01-01" }],
    ["不正な日付形式", { name: "S", startsAt: "2026/01/01", endsAt: "2026-03-31" }],
    ["空の名前", { name: "  ", startsAt: "2026-01-01", endsAt: "2026-03-31" }],
  ])("%sを拒否する", (_label, input) => {
    expect(adminSeasonCreateSchema.safeParse(input).success).toBe(false);
  });

  it("応答スキーマは strict で未知キーを拒否する", () => {
    expect(
      adminSeasonSchema.safeParse({
        id: 1,
        name: "S",
        startsAt: "2026-01-01",
        endsAt: "2026-03-31",
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it("シーズンレスポンス・一覧を検証する", () => {
    const season = { id: 1, name: "シーズン12", startsAt: "2026-01-01", endsAt: "2026-03-31" };
    expect(adminSeasonSchema.parse(season)).toEqual(season);
    expect(adminSeasonListResponseSchema.parse({ items: [season] }).items).toHaveLength(1);
  });

  it("数値パスパラメータを整数へ変換し、不正値を拒否する", () => {
    expect(adminSeasonIdParamsSchema.parse({ id: "4" })).toEqual({ id: 4 });
    expect(adminSeasonIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
    expect(adminSeasonIdParamsSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(adminSeasonIdParamsSchema.safeParse({ id: "1.5" }).success).toBe(false);
  });

  it("一括アーカイブのレスポンスを検証する", () => {
    expect(adminSeasonArchiveResponseSchema.parse({ seasonId: 1, archivedCount: 3 })).toEqual({
      seasonId: 1,
      archivedCount: 3,
    });
    expect(
      adminSeasonArchiveResponseSchema.safeParse({ seasonId: 1, archivedCount: -1 }).success,
    ).toBe(false);
  });
});

describe("ARCHETYPE-003 rule admin schemas", () => {
  it("正常なルール作成入力を受理する", () => {
    expect(
      adminRuleCreateSchema.parse({
        name: " シングル ",
        teamSize: 6,
        pickSize: 3,
        battleLevel: 50,
      }),
    ).toEqual({
      name: "シングル",
      teamSize: 6,
      pickSize: 3,
      battleLevel: 50,
    });
  });

  it.each([
    ["pickSizeがteamSizeを超過", { name: "R", teamSize: 3, pickSize: 6, battleLevel: 50 }],
    ["teamSizeが範囲外", { name: "R", teamSize: 7, pickSize: 3, battleLevel: 50 }],
    ["pickSizeが0", { name: "R", teamSize: 6, pickSize: 0, battleLevel: 50 }],
    ["空の名前", { name: " ", teamSize: 6, pickSize: 3, battleLevel: 50 }],
    ["battleLevelが0", { name: "R", teamSize: 6, pickSize: 3, battleLevel: 0 }],
  ])("%sを拒否する", (_label, input) => {
    expect(adminRuleCreateSchema.safeParse(input).success).toBe(false);
  });

  it("ルールレスポンス・一覧を検証する", () => {
    const rule = { id: 1, name: "シングル", teamSize: 6, pickSize: 3, battleLevel: 50 };
    expect(adminRuleSchema.parse(rule)).toEqual(rule);
    expect(adminRuleListResponseSchema.parse({ items: [rule] }).items).toHaveLength(1);
    expect(adminRuleSchema.safeParse({ ...rule, extra: 1 }).success).toBe(false);
  });
});
