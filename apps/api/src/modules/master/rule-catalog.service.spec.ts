import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { RuleCatalogService } from "./rule-catalog.service";

describe("RuleCatalogService", () => {
  const findMany = vi.fn();
  const prisma = {
    rule: { findMany },
  } as unknown as PrismaService;
  const service = new RuleCatalogService(prisma);

  beforeEach(() => {
    findMany.mockReset();
  });

  it("必要項目だけをname ASC、id ASCで取得する", async () => {
    const rules = [
      { id: 2, name: "ダブル", teamSize: 6, pickSize: 4 },
      { id: 1, name: "シングル", teamSize: 6, pickSize: 3 },
    ];
    findMany.mockResolvedValue(rules);

    await expect(service.list()).resolves.toEqual(rules);
    expect(findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        teamSize: true,
        pickSize: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("0件の場合は空配列を返す", async () => {
    findMany.mockResolvedValue([]);

    await expect(service.list()).resolves.toEqual([]);
  });

  it("不正なDB値を内部情報なしの500として扱う", async () => {
    findMany.mockResolvedValue([{ id: 1, name: "broken", teamSize: 2, pickSize: 3 }]);

    await expect(service.list()).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Master Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });
});
