import { describe, expect, it } from "vitest";
import {
  adminArchetypePopularitySchema,
  adminArchetypePopularityUpdateSchema,
} from "./admin-archetypes";

const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

describe("ARCHETYPE-003 popularity update schema", () => {
  it("popularityTierのみの最小入力を受理する", () => {
    expect(adminArchetypePopularityUpdateSchema.parse({ popularityTier: "high" })).toEqual({
      popularityTier: "high",
    });
  });

  it("popularityScore・encounterCount・pickCountの手動更新を受理する", () => {
    const input = {
      popularityTier: "mid",
      popularityScore: 42.5,
      encounterCount: 10,
      pickCount: 3,
    };
    expect(adminArchetypePopularityUpdateSchema.parse(input)).toEqual(input);
  });

  it("popularityScoreは0とnullを区別して受理する", () => {
    expect(
      adminArchetypePopularityUpdateSchema.parse({ popularityTier: "low", popularityScore: 0 })
        .popularityScore,
    ).toBe(0);
    expect(
      adminArchetypePopularityUpdateSchema.parse({ popularityTier: "low", popularityScore: null })
        .popularityScore,
    ).toBeNull();
    // 未指定は省略(部分更新)
    expect(
      "popularityScore" in adminArchetypePopularityUpdateSchema.parse({ popularityTier: "low" }),
    ).toBe(false);
  });

  it.each([
    ["不正なpopularityTier", { popularityTier: "sss" }],
    ["負のencounterCount", { popularityTier: "high", encounterCount: -1 }],
    ["小数のencounterCount", { popularityTier: "high", encounterCount: 1.5 }],
    ["int4超のpickCount", { popularityTier: "high", pickCount: 2_147_483_648 }],
    ["負のpopularityScore", { popularityTier: "high", popularityScore: -1 }],
    ["100超のpopularityScore", { popularityTier: "high", popularityScore: 100.1 }],
    ["NaNのpopularityScore", { popularityTier: "high", popularityScore: Number.NaN }],
    [
      "InfinityのpopularityScore",
      { popularityTier: "high", popularityScore: Number.POSITIVE_INFINITY },
    ],
    ["popularityTier欠落", { encounterCount: 1 }],
    ["未知キー", { popularityTier: "high", foo: 1 }],
  ])("%sを拒否する", (_label, input) => {
    expect(adminArchetypePopularityUpdateSchema.safeParse(input).success).toBe(false);
  });

  it("正常なレスポンスを検証し、内部項目を含めない", () => {
    const response = {
      id: archetypeId,
      popularityTier: "high",
      popularityScore: null,
      encounterCount: 5,
      pickCount: 2,
      updatedAt: "2026-07-26T00:00:00.000Z",
    };
    expect(adminArchetypePopularitySchema.parse(response)).toEqual(response);
  });

  it("レスポンスは strict で構築本文などの内部項目を拒否する", () => {
    expect(
      adminArchetypePopularitySchema.safeParse({
        id: archetypeId,
        popularityTier: "high",
        popularityScore: null,
        encounterCount: 5,
        pickCount: 2,
        updatedAt: "2026-07-26T00:00:00.000Z",
        description: "内部情報",
      }).success,
    ).toBe(false);
  });
});
