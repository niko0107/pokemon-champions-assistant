import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { BattleSessionArchiveConfig } from "./battle-session-archive.config";
import { BattleSessionArchiveService } from "./battle-session-archive.service";

const now = new Date("2026-07-26T12:00:00.000Z");
const config: BattleSessionArchiveConfig = {
  activeArchiveAfterSeconds: 120,
  endedArchiveAfterSeconds: 240,
  intervalSeconds: 30,
};

describe("BattleSessionArchiveService", () => {
  const updateMany = vi.fn();
  const service = new BattleSessionArchiveService(
    {
      battleSession: { updateMany },
    } as unknown as PrismaService,
    config,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 0 });
  });

  it("古いactiveと古いendedだけを単一の条件付きupdateManyでarchiveする", async () => {
    updateMany.mockResolvedValue({ count: 2 });

    await expect(service.archiveExpiredSessions(now)).resolves.toEqual({ count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            status: "active",
            updatedAt: { lt: new Date("2026-07-26T11:58:00.000Z") },
          },
          {
            status: "ended",
            endedAt: { not: null, lt: new Date("2026-07-26T11:56:00.000Z") },
          },
        ],
      },
      data: { status: "archived" },
    });
  });

  it("新しいactive・ended、既存archived、閾値ちょうどは対象外になる厳密なlt条件を使う", async () => {
    await expect(service.archiveExpiredSessions(now)).resolves.toEqual({ count: 0 });

    const where = updateMany.mock.calls[0]?.[0].where;
    expect(where).toEqual({
      OR: [
        {
          status: "active",
          updatedAt: { lt: new Date("2026-07-26T11:58:00.000Z") },
        },
        {
          status: "ended",
          endedAt: { not: null, lt: new Date("2026-07-26T11:56:00.000Z") },
        },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('"status":"archived"');
  });

  it("result・selectedArchetypeId・endedAt・Observationを変更しない", async () => {
    await service.archiveExpiredSessions(now);

    expect(updateMany.mock.calls[0]?.[0].data).toEqual({ status: "archived" });
  });

  it("DBエラーを隠さず呼び出し元へ伝え、次回実行できる", async () => {
    updateMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.archiveExpiredSessions(now)).rejects.toThrow("database unavailable");
    await expect(service.archiveExpiredSessions(now)).resolves.toEqual({ count: 0 });
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("複数インスタンス相当の同時実行でも同じ条件を再確認し件数を返す", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const otherService = new BattleSessionArchiveService(
      {
        battleSession: { updateMany },
      } as unknown as PrismaService,
      config,
    );

    await expect(
      Promise.all([service.archiveExpiredSessions(now), otherService.archiveExpiredSessions(now)]),
    ).resolves.toEqual([{ count: 1 }, { count: 0 }]);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0]?.[0].where).toEqual(updateMany.mock.calls[1]?.[0].where);
  });
});
