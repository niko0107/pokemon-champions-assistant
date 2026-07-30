import { describe, beforeEach, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ArchetypesService } from "./archetypes.service";

const archetypeId = "30000000-0000-4000-8000-000000000001";

function decimal(value: number): { toNumber: () => number } {
  return { toNumber: () => value };
}

function pokemon(slot: number) {
  return {
    slot,
    usageRate: decimal(slot / 10),
    nature: slot === 1 ? "ようき" : null,
    teraType: slot === 1 ? "fire" : null,
    evs: slot === 1 ? { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } : null,
    statPoints: null as {
      hp: number;
      attack: number;
      defense: number;
      specialAttack: number;
      specialDefense: number;
      speed: number;
    } | null,
    ivs: null,
    actualStats: {
      hp: 150,
      attack: 120,
      defense: 100,
      specialAttack: 90,
      specialDefense: 100,
      speed: 110,
    } as {
      hp: number;
      attack: number;
      defense: number;
      specialAttack: number;
      specialDefense: number;
      speed: number;
    } | null,
    statDataStatus: "exact",
    role: slot === 1 ? "lead" : "support",
    threatNotes: slot === 1 ? "積み技に注意" : null,
    pokemon: {
      id: slot,
      nameJa: `ポケモン${slot}`,
      nameEn: `Pokemon ${slot}`,
      form: slot === 1 ? "mega" : "normal",
      type1: "fire",
      type2: slot === 1 ? "flying" : null,
      isMega: slot === 1,
    },
    item: slot === 1 ? { id: 1, nameJa: "きあいのタスキ", nameEn: "Focus Sash" } : null,
    ability: slot === 1 ? { id: 1, nameJa: "もうか", nameEn: "Blaze" } : null,
    moves: [
      {
        moveId: slot * 10 + 2,
        adoptionRate: decimal(0.5),
        move: {
          nameJa: `技${slot}B`,
          nameEn: `Move ${slot} B`,
          type: "fire",
          category: "status",
          power: null,
          accuracy: null,
          priority: 0,
          tags: ["status"],
        },
      },
      {
        moveId: slot * 10 + 1,
        adoptionRate: decimal(1),
        move: {
          nameJa: `技${slot}A`,
          nameEn: `Move ${slot} A`,
          type: "fire",
          category: "special",
          power: 90,
          accuracy: 100,
          priority: 0,
          tags: [],
        },
      },
    ],
  };
}

function record() {
  return {
    id: archetypeId,
    name: "公開構築",
    description: "公開構築の説明",
    defaultLeads: [1, 3, 6],
    playstyleNotes: "基本選出から展開する",
    rule: {
      id: 1,
      name: "シングルバトル",
      teamSize: 6,
      pickSize: 3,
      battleLevel: 50,
    },
    season: {
      id: 1,
      name: "シーズン1",
    },
    pokemons: Array.from({ length: 6 }, (_, index) => pokemon(index + 1)),
    sources: [
      { title: "出典A", url: "https://example.com/a", siteName: "Example" },
      { title: "出典B", url: "https://example.com/b", siteName: "Example" },
    ],
  };
}

describe("ArchetypesService", () => {
  const findFirst = vi.fn();
  const service = new ArchetypesService({
    archetype: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => {
    findFirst.mockReset();
  });

  it("published構築をnested select 1回で取得し、Decimalとmaster表示情報を射影する", async () => {
    findFirst.mockResolvedValue(record());

    const result = await service.get(archetypeId);

    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: archetypeId, status: "published" },
        select: expect.objectContaining({
          id: true,
          pokemons: expect.objectContaining({
            orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
            select: expect.objectContaining({
              pokemon: { select: expect.objectContaining({ nameJa: true, isMega: true }) },
              item: { select: { id: true, nameJa: true, nameEn: true } },
              moves: expect.objectContaining({
                orderBy: [{ adoptionRate: "desc" }, { moveId: "asc" }],
              }),
            }),
          }),
          sources: expect.objectContaining({
            orderBy: [{ title: "asc" }, { url: "asc" }],
          }),
        }),
      }),
    );
    expect(result.pokemons).toHaveLength(6);
    expect(result.pokemons[0]).toMatchObject({
      slot: 1,
      usageRate: 0.1,
      item: { nameJa: "きあいのタスキ" },
      threatNotes: "積み技に注意",
      moves: [
        { moveId: 12, adoptionRate: 0.5, nameJa: "技1B" },
        { moveId: 11, adoptionRate: 1, nameJa: "技1A" },
      ],
    });
    expect(result.pokemons[1]?.item).toBeNull();
    expect(result.defaultLeads).toEqual([1, 3, 6]);
    expect(result.playstyleNotes).toBe("基本選出から展開する");
    expect(result.sources).toHaveLength(2);
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).not.toHaveProperty("publishedAt");
    expect(result).not.toHaveProperty("popularityScore");
    expect(result).not.toHaveProperty("encounterCount");
    expect(result).not.toHaveProperty("pickCount");
  });

  it("nullable値・能力ポイント・unclassifiedを補完や変換せず公開GETで返す", async () => {
    const value = record();
    const statPoints = {
      hp: 32,
      attack: 0,
      defense: 10,
      specialAttack: 0,
      specialDefense: 24,
      speed: 0,
    };
    value.pokemons[0] = {
      ...value.pokemons[0]!,
      item: null,
      ability: null,
      evs: null,
      statPoints,
      ivs: null,
      actualStats: null,
      statDataStatus: "partial",
      role: "unclassified",
      threatNotes: null,
      moves: [],
    };
    findFirst.mockResolvedValue(value);

    const result = await service.get(archetypeId);
    expect(result.pokemons[0]).toMatchObject({
      item: null,
      ability: null,
      evs: null,
      statPoints,
      ivs: null,
      actualStats: null,
      statDataStatus: "partial",
      role: "unclassified",
      threatNotes: null,
      moves: [],
    });
  });

  it("defaultLeads空配列を補完せず公開詳細へ返す", async () => {
    const value = record();
    value.defaultLeads = [];
    findFirst.mockResolvedValue(value);

    await expect(service.get(archetypeId)).resolves.toMatchObject({ defaultLeads: [] });
  });

  it.each(["不存在", "archived", "想定外の非公開status"])("%sを同じ404にする", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.get(archetypeId)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Archetype Not Found",
        status: 404,
        code: "NOT_FOUND",
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: archetypeId, status: "published" } }),
    );
  });

  it.each([
    ["不正なdefaultLeads", { defaultLeads: [99] }],
    ["不正なactualStats", { mutateStats: true }],
    ["不正なstatPoints", { mutateStatPoints: true }],
    ["不正な出典URL", { sources: [{ title: "危険", url: "javascript:alert(1)", siteName: "X" }] }],
  ])("%sを内部情報なしの500にする", async (_label, change) => {
    const value = record();
    if ("defaultLeads" in change) {
      value.defaultLeads = change.defaultLeads;
    }
    if ("mutateStats" in change) {
      value.pokemons[0] = {
        ...value.pokemons[0]!,
        actualStats: { ...value.pokemons[0]!.actualStats!, hp: 0 },
      };
    }
    if ("mutateStatPoints" in change) {
      value.pokemons[0] = {
        ...value.pokemons[0]!,
        statPoints: {
          hp: 32,
          attack: 32,
          defense: 3,
          specialAttack: 0,
          specialDefense: 0,
          speed: 0,
        },
      };
    }
    if ("sources" in change) {
      value.sources = change.sources;
    }
    findFirst.mockResolvedValue(value);

    await expect(service.get(archetypeId)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Archetype Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("Prismaエラーを秘密情報なしの500にし、書き込みを行わない", async () => {
    findFirst.mockRejectedValue(new Error("postgres://private"));

    await expect(service.get(archetypeId)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Archetype Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(findFirst).toHaveBeenCalledOnce();
  });
});
