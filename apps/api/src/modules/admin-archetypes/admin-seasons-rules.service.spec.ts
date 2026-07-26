import { Prisma } from "@pokemon-champions/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminSeasonsRulesService } from "./admin-seasons-rules.service";

const seasonRow = {
  id: 1,
  name: "シーズン12",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2026-03-31T00:00:00.000Z"),
};
const ruleRow = {
  id: 1,
  name: "シングル",
  teamSize: 6,
  pickSize: 3,
  battleLevel: 50,
};

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

describe("AdminSeasonsRulesService (ARCHETYPE-003)", () => {
  const seasonFindMany = vi.fn();
  const seasonCreate = vi.fn();
  const seasonFindUnique = vi.fn();
  const ruleFindMany = vi.fn();
  const ruleCreate = vi.fn();
  const archetypeUpdateMany = vi.fn();

  const transaction = {
    season: { findUnique: seasonFindUnique },
    archetype: { updateMany: archetypeUpdateMany },
  };
  const runTransaction = vi.fn(async (cb: (tx: typeof transaction) => Promise<unknown>) =>
    cb(transaction),
  );

  const prisma = {
    season: { findMany: seasonFindMany, create: seasonCreate },
    rule: { findMany: ruleFindMany, create: ruleCreate },
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const service = new AdminSeasonsRulesService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    seasonFindMany.mockResolvedValue([seasonRow]);
    seasonCreate.mockResolvedValue(seasonRow);
    seasonFindUnique.mockResolvedValue({ id: 1 });
    ruleFindMany.mockResolvedValue([ruleRow]);
    ruleCreate.mockResolvedValue(ruleRow);
    archetypeUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("シーズン一覧をstartsAt降順で取得し日付をYYYY-MM-DDへ変換する", async () => {
    const seasons = await service.listSeasons();
    expect(seasonFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ startsAt: "desc" }, { id: "asc" }] }),
    );
    expect(seasons[0]).toEqual({
      id: 1,
      name: "シーズン12",
      startsAt: "2026-01-01",
      endsAt: "2026-03-31",
    });
  });

  it("シーズンを作成し、Dateへ変換して保存する", async () => {
    const result = await service.createSeason({
      name: "シーズン12",
      startsAt: "2026-01-01",
      endsAt: "2026-03-31",
    });
    expect(seasonCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "シーズン12",
          startsAt: new Date("2026-01-01"),
          endsAt: new Date("2026-03-31"),
        }),
      }),
    );
    expect(result.startsAt).toBe("2026-01-01");
  });

  it("シーズン名重複(P2002)を409 SEASON_CONFLICTに変換する", async () => {
    seasonCreate.mockRejectedValue(p2002());
    await expect(
      service.createSeason({ name: "重複", startsAt: "2026-01-01", endsAt: "2026-03-31" }),
    ).rejects.toMatchObject({ status: 409, response: { code: "SEASON_CONFLICT" } });
  });

  it("ルールを作成する", async () => {
    const result = await service.createRule({
      name: "シングル",
      teamSize: 6,
      pickSize: 3,
      battleLevel: 50,
    });
    expect(ruleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "シングル",
          teamSize: 6,
          pickSize: 3,
          battleLevel: 50,
        },
      }),
    );
    expect(result).toEqual(ruleRow);
  });

  it("ルール名重複(P2002)を409 RULE_CONFLICTに変換する", async () => {
    ruleCreate.mockRejectedValue(p2002());
    await expect(
      service.createRule({ name: "重複", teamSize: 6, pickSize: 3, battleLevel: 50 }),
    ).rejects.toMatchObject({ status: 409, response: { code: "RULE_CONFLICT" } });
  });

  it("指定シーズンのpublished構築のみ一括archivedにして件数を返す", async () => {
    const result = await service.archiveArchetypesBySeason(1);
    expect(archetypeUpdateMany).toHaveBeenCalledWith({
      where: { seasonId: 1, status: "published" },
      data: { status: "archived" },
    });
    expect(result).toEqual({ seasonId: 1, archivedCount: 2 });
  });

  it("存在しないシーズンの一括アーカイブを404にし、更新しない", async () => {
    seasonFindUnique.mockResolvedValue(null);
    await expect(service.archiveArchetypesBySeason(999)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
    expect(archetypeUpdateMany).not.toHaveBeenCalled();
  });
});
