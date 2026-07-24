import { describe, expect, it } from "vitest";
import {
  adminArchetypeDetailSchema,
  adminArchetypeIdParamsSchema,
  adminArchetypeListResponseSchema,
  adminArchetypeWriteSchema,
} from "./admin-archetypes";

const validInput = {
  name: " メガギャラドス展開 ",
  description: " 起点を作って展開する構築 ",
  seasonId: 1,
  ruleId: 1,
  defaultLeads: [1, 2, 3],
  playstyleNotes: " カバルドンから展開する ",
  pokemons: [
    {
      slot: 1,
      pokemonId: 1,
      itemId: 1,
      itemAlternatives: [2],
      abilityId: 1,
      nature: "わんぱく",
      teraType: null,
      evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
      role: "lead",
      usageRate: 1,
      threatNotes: "あくびに注意",
      moves: [
        { moveId: 1, adoptionRate: 1 },
        { moveId: 2, adoptionRate: 0.5 },
      ],
    },
    {
      slot: 2,
      pokemonId: 2,
      role: "sweeper",
      moves: [{ moveId: 3 }],
    },
    {
      slot: 3,
      pokemonId: 3,
      role: "support",
      moves: [{ moveId: 4 }],
    },
  ],
  sources: [
    {
      title: " 構築記事 ",
      url: "https://example.com/archetype",
      siteName: " Example ",
    },
  ],
} as const;

describe("ARCHETYPE-002 shared API schemas", () => {
  it("作成・PUT入力をtrimし、省略可能値へ安全な既定値を設定する", () => {
    const parsed = adminArchetypeWriteSchema.parse(validInput);

    expect(parsed.name).toBe("メガギャラドス展開");
    expect(parsed.status).toBe("published");
    expect(parsed.pokemons[1]).toMatchObject({
      itemId: null,
      itemAlternatives: [],
      abilityId: null,
      nature: null,
      teraType: null,
      evs: null,
      usageRate: 1,
      threatNotes: null,
      moves: [{ moveId: 3, adoptionRate: 1 }],
    });
    expect(parsed.sources[0]).toMatchObject({
      title: "構築記事",
      siteName: "Example",
      siteRank: null,
    });
  });

  it.each([
    [
      "ポケモンslot重複",
      { pokemons: [{ ...validInput.pokemons[0] }, { ...validInput.pokemons[1], slot: 1 }] },
    ],
    [
      "ポケモン重複",
      { pokemons: [{ ...validInput.pokemons[0] }, { ...validInput.pokemons[1], pokemonId: 1 }] },
    ],
    [
      "技重複",
      {
        pokemons: [
          {
            ...validInput.pokemons[0],
            moves: [
              { moveId: 1, adoptionRate: 1 },
              { moveId: 1, adoptionRate: 0.5 },
            ],
          },
        ],
        defaultLeads: [1],
      },
    ],
    [
      "定番・代替持ち物重複",
      { pokemons: [{ ...validInput.pokemons[0], itemAlternatives: [1] }], defaultLeads: [1] },
    ],
    ["出典URL重複", { sources: [validInput.sources[0], validInput.sources[0]] }],
    ["存在しない基本選出slot", { defaultLeads: [1, 6] }],
  ])("%sを拒否する", (_label, override) => {
    expect(adminArchetypeWriteSchema.safeParse({ ...validInput, ...override }).success).toBe(false);
  });

  it("出典なし・http(s)以外・範囲外rateを拒否する", () => {
    expect(adminArchetypeWriteSchema.safeParse({ ...validInput, sources: [] }).success).toBe(false);
    expect(
      adminArchetypeWriteSchema.safeParse({
        ...validInput,
        sources: [{ ...validInput.sources[0], url: "ftp://example.com/archetype" }],
      }).success,
    ).toBe(false);
    expect(
      adminArchetypeWriteSchema.safeParse({
        ...validInput,
        pokemons: [{ ...validInput.pokemons[0], usageRate: 1.1 }],
        defaultLeads: [1],
      }).success,
    ).toBe(false);
  });

  it("UUIDパラメータと詳細・一覧レスポンスを検証する", () => {
    const id = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";
    const parsedInput = adminArchetypeWriteSchema.parse(validInput);
    const detail = {
      ...parsedInput,
      id,
      popularityTier: "mid",
      popularityScore: null,
      encounterCount: 0,
      pickCount: 0,
      publishedAt: "2026-07-25T00:00:00.000Z",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    };

    expect(adminArchetypeIdParamsSchema.parse({ id })).toEqual({ id });
    expect(adminArchetypeIdParamsSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(adminArchetypeDetailSchema.parse(detail)).toEqual(detail);
    expect(
      adminArchetypeListResponseSchema.safeParse({
        items: [
          {
            id,
            name: detail.name,
            description: detail.description,
            seasonId: detail.seasonId,
            ruleId: detail.ruleId,
            popularityTier: detail.popularityTier,
            status: detail.status,
            publishedAt: detail.publishedAt,
            updatedAt: detail.updatedAt,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
