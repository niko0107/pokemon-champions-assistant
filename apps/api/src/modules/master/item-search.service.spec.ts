import { MASTER_SEARCH_RESULT_LIMIT, type ItemSummary } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ItemSearchService } from "./item-search.service";

const choiceScarf: ItemSummary = {
  id: 1,
  nameJa: "こだわりスカーフ",
  nameEn: "Choice Scarf",
  effectTags: ["choice", "speed_boost"],
};

const silkScarf: ItemSummary = {
  id: 2,
  nameJa: "シルクのスカーフ",
  nameEn: "Silk Scarf",
  effectTags: ["type_boost"],
};

describe("ItemSearchService", () => {
  const findMany = vi.fn();
  const service = new ItemSearchService({
    item: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    findMany.mockReset();
  });

  it("前方一致を部分一致より先に返す", async () => {
    findMany.mockResolvedValueOnce([choiceScarf]).mockResolvedValueOnce([silkScarf]);

    await expect(service.search({ q: "scarf" })).resolves.toEqual([choiceScarf, silkScarf]);

    const prefixArgs = findMany.mock.calls[0]?.[0];
    expect(prefixArgs.where.OR[1]).toEqual({
      nameEn: { startsWith: "scarf", mode: "insensitive" },
    });
    expect(findMany.mock.calls[1]?.[0].where.AND[1]).toEqual({
      NOT: prefixArgs.where,
    });
  });

  it("必要な列、固定上限、決定的な並び順だけを指定する", async () => {
    findMany.mockResolvedValue([]);

    await service.search({ q: "こだ" });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      select: {
        id: true,
        nameJa: true,
        nameEn: true,
        effectTags: true,
      },
      orderBy: [{ nameJa: "asc" }, { nameEn: "asc" }, { id: "asc" }],
      take: MASTER_SEARCH_RESULT_LIMIT,
    });
  });

  it("0件の場合は空配列を返す", async () => {
    findMany.mockResolvedValue([]);
    await expect(service.search({ q: "存在しない" })).resolves.toEqual([]);
  });
});
