import { describe, expect, it } from "vitest";
import { calendarDateSchema, seasonMasterSchema } from "./season";

describe("calendarDateSchema", () => {
  it("有効な暦日を受理する", () => {
    expect(calendarDateSchema.parse("2026-07-25")).toBe("2026-07-25");
  });

  it.each(["2026-02-30", "2026/07/25", "2026-7-25"])("%sを拒否する", (value) => {
    expect(calendarDateSchema.safeParse(value).success).toBe(false);
  });
});

describe("seasonMasterSchema", () => {
  it("開始日から終了日までの期間を受理する", () => {
    expect(
      seasonMasterSchema.parse({
        name: "シーズン12",
        startsAt: "2026-07-01",
        endsAt: "2026-07-31",
      }),
    ).toEqual({
      name: "シーズン12",
      startsAt: "2026-07-01",
      endsAt: "2026-07-31",
    });
  });

  it("開始日と終了日が同じ期間を受理する", () => {
    expect(
      seasonMasterSchema.safeParse({
        name: "1日大会",
        startsAt: "2026-07-25",
        endsAt: "2026-07-25",
      }).success,
    ).toBe(true);
  });

  it("終了日が開始日より前の期間を拒否する", () => {
    expect(
      seasonMasterSchema.safeParse({
        name: "逆転期間",
        startsAt: "2026-07-25",
        endsAt: "2026-07-24",
      }).success,
    ).toBe(false);
  });

  it("空のシーズン名を拒否する", () => {
    expect(
      seasonMasterSchema.safeParse({
        name: " ",
        startsAt: "2026-07-01",
        endsAt: "2026-07-31",
      }).success,
    ).toBe(false);
  });
});
