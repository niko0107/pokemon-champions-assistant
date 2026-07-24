import { describe, expect, it } from "vitest";
import {
  abilitySearchQuerySchema,
  abilitySearchResponseSchema,
  abilitySummarySchema,
} from "./master-abilities";
import { itemSearchQuerySchema, itemSearchResponseSchema, itemSummarySchema } from "./master-items";
import { moveSearchQuerySchema, moveSearchResponseSchema, moveSummarySchema } from "./master-moves";
import { MASTER_SEARCH_MAX_QUERY_LENGTH, MASTER_SEARCH_RESULT_LIMIT } from "./master-search";

describe("moveSearchQuerySchema", () => {
  it("qのみ、pokemon_idのみ、両方指定を受理する", () => {
    expect(moveSearchQuerySchema.parse({ q: "  Water  " })).toEqual({ q: "Water" });
    expect(moveSearchQuerySchema.parse({ pokemon_id: "130" })).toEqual({ pokemon_id: 130 });
    expect(moveSearchQuerySchema.parse({ q: "たき", pokemon_id: "130" })).toEqual({
      q: "たき",
      pokemon_id: 130,
    });
  });

  it("qもpokemon_idも未指定の場合を拒否する", () => {
    expect(moveSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992"])(
    "不正なpokemon_id=%sを拒否する",
    (pokemon_id) => {
      expect(moveSearchQuerySchema.safeParse({ pokemon_id }).success).toBe(false);
    },
  );

  it("短すぎる・長すぎるqを拒否する", () => {
    expect(moveSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(
      moveSearchQuerySchema.safeParse({ q: "a".repeat(MASTER_SEARCH_MAX_QUERY_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});

describe("itemSearchQuerySchema / abilitySearchQuerySchema", () => {
  it("持ち物のqをtrimし、特性のpokemon_idを数値へ変換する", () => {
    expect(itemSearchQuerySchema.parse({ q: "  Choice  " })).toEqual({ q: "Choice" });
    expect(abilitySearchQuerySchema.parse({ pokemon_id: "130" })).toEqual({
      pokemon_id: 130,
    });
  });

  it("必須条件を満たさないクエリを拒否する", () => {
    expect(itemSearchQuerySchema.safeParse({}).success).toBe(false);
    expect(itemSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(abilitySearchQuerySchema.safeParse({}).success).toBe(false);
    expect(abilitySearchQuerySchema.safeParse({ pokemon_id: "0" }).success).toBe(false);
  });
});

describe("MASTER-007 response schemas", () => {
  const move = {
    id: 1,
    nameJa: "たきのぼり",
    nameEn: "Waterfall",
    type: "water",
    category: "physical",
    power: 80,
    accuracy: 100,
    priority: 0,
    tags: [],
  };
  const item = {
    id: 1,
    nameJa: "こだわりスカーフ",
    nameEn: "Choice Scarf",
    effectTags: ["choice", "speed_boost"],
  };
  const ability = {
    id: 1,
    nameJa: "いかく",
    nameEn: "Intimidate",
    effectTags: ["stat_control"],
  };

  it("必要なフィールドを持つ技・持ち物・特性を受理する", () => {
    expect(moveSummarySchema.parse(move)).toEqual(move);
    expect(itemSummarySchema.parse(item)).toEqual(item);
    expect(abilitySummarySchema.parse(ability)).toEqual(ability);
  });

  it("0件レスポンスを受理する", () => {
    expect(moveSearchResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(itemSearchResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(abilitySearchResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it("固定上限を超えるレスポンスを拒否する", () => {
    const items = Array.from({ length: MASTER_SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({
      ...move,
      id: index + 1,
    }));
    expect(moveSearchResponseSchema.safeParse({ items }).success).toBe(false);
  });
});
