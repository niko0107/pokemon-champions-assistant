import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleSessionArchiveConfig } from "./battle-session-archive.config";
import { BattleSessionArchiveScheduler } from "./battle-session-archive.scheduler";
import type { BattleSessionArchiveService } from "./battle-session-archive.service";

const config: BattleSessionArchiveConfig = {
  activeArchiveAfterSeconds: 120,
  endedArchiveAfterSeconds: 240,
  intervalSeconds: 10,
};

describe("BattleSessionArchiveScheduler", () => {
  const archiveExpiredSessions = vi.fn();
  let scheduler: BattleSessionArchiveScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    archiveExpiredSessions.mockReset();
    archiveExpiredSessions.mockResolvedValue({ count: 2 });
    scheduler = new BattleSessionArchiveScheduler(
      { archiveExpiredSessions } as unknown as BattleSessionArchiveService,
      config,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("起動時に指定間隔のschedulerを登録しServiceを呼ぶ", async () => {
    scheduler.onApplicationBootstrap();

    expect(archiveExpiredSessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(archiveExpiredSessions).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(archiveExpiredSessions).toHaveBeenCalledTimes(3);
  });

  it("前回実行中なら同一プロセス内の重複起動をスキップする", async () => {
    let finish: ((value: { count: number }) => void) | undefined;
    archiveExpiredSessions.mockImplementationOnce(
      () =>
        new Promise<{ count: number }>((resolve) => {
          finish = resolve;
        }),
    );
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(archiveExpiredSessions).toHaveBeenCalledOnce();

    finish?.({ count: 1 });
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(archiveExpiredSessions).toHaveBeenCalledTimes(2);
  });

  it("shutdown時にschedulerを停止する", async () => {
    scheduler.onApplicationBootstrap();
    scheduler.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(archiveExpiredSessions).not.toHaveBeenCalled();
  });

  it("失敗を未処理例外にせず、次のintervalで再実行する", async () => {
    archiveExpiredSessions
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ count: 0 });
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(archiveExpiredSessions).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(archiveExpiredSessions).toHaveBeenCalledTimes(2);
  });

  it("処理開始・完了件数を安全な集約ログへ記録する", async () => {
    const log = vi.spyOn(Logger.prototype, "log");

    await expect(scheduler.runOnce()).resolves.toEqual({ count: 2 });
    expect(log).toHaveBeenCalledWith("Battle session archive job started.");
    expect(log).toHaveBeenCalledWith("Battle session archive job completed. count=2");
  });
});
