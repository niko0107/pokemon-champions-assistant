import { MASTER_SEARCH_RESULT_LIMIT, type MoveSummary } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { MoveSearchService } from "./move-search.service";

const waterfall: MoveSummary = {
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

const muddyWater: MoveSummary = {
  ...waterfall,
  id: 2,
  nameJa: "だくりゅう",
  nameEn: "Muddy Water",
  category: "special",
  power: 90,
  accuracy: 85,
};

describe("MoveSearchService", () => {
  const findMany = vi.fn();
  const service = new MoveSearchService({
    move: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    findMany.mockReset();
  });

  it("qのみでは前方一致を部分一致より先に返す", async () => {
    findMany.mockResolvedValueOnce([waterfall]).mockResolvedValueOnce([muddyWater]);

    await expect(service.search({ q: "water" })).resolves.toEqual([waterfall, muddyWater]);

    const prefixArgs = findMany.mock.calls[0]?.[0];
    expect(prefixArgs.where).toEqual({
      OR: [
        { nameJa: { startsWith: "water" } },
        { nameEn: { startsWith: "water", mode: "insensitive" } },
      ],
    });
    expect(prefixArgs.take).toBe(MASTER_SEARCH_RESULT_LIMIT);

    const containsArgs = findMany.mock.calls[1]?.[0];
    expect(containsArgs.where.AND[1]).toEqual({ NOT: prefixArgs.where });
    expect(containsArgs.take).toBe(MASTER_SEARCH_RESULT_LIMIT - 1);
  });

  it("pokemon_idのみでは習得可能技に絞って1回検索する", async () => {
    findMany.mockResolvedValue([waterfall]);

    await expect(service.search({ pokemon_id: 130 })).resolves.toEqual([waterfall]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      learnedBy: { some: { pokemonId: 130 } },
    });
  });

  it("qとpokemon_idを同時に指定すると両条件を適用する", async () => {
    findMany.mockResolvedValueOnce([waterfall]).mockResolvedValueOnce([]);

    await service.search({ q: "たき", pokemon_id: 130 });

    const prefixArgs = findMany.mock.calls[0]?.[0];
    expect(prefixArgs.where.AND).toEqual([
      { learnedBy: { some: { pokemonId: 130 } } },
      {
        OR: [
          { nameJa: { startsWith: "たき" } },
          { nameEn: { startsWith: "たき", mode: "insensitive" } },
        ],
      },
    ]);
    expect(findMany.mock.calls[1]?.[0].where.AND[0]).toEqual({
      learnedBy: { some: { pokemonId: 130 } },
    });
  });

  it("必要な列、固定上限、決定的な並び順だけを指定する", async () => {
    findMany.mockResolvedValue([]);

    await service.search({ pokemon_id: 130 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      select: {
        id: true,
        nameJa: true,
        nameEn: true,
        type: true,
        category: true,
        power: true,
        accuracy: true,
        priority: true,
        tags: true,
      },
      orderBy: [{ nameJa: "asc" }, { nameEn: "asc" }, { id: "asc" }],
      take: MASTER_SEARCH_RESULT_LIMIT,
    });
  });

  it("0件の場合は空配列を返す", async () => {
    findMany.mockResolvedValue([]);
    await expect(service.search({ pokemon_id: 9999 })).resolves.toEqual([]);
  });
});
