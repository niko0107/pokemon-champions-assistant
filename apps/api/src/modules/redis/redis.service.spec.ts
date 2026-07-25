import { EventEmitter } from "node:events";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisClient } from "./redis-client.provider";
import { RedisService } from "./redis.service";

class MockRedisClient extends EventEmitter {
  isOpen = false;
  isReady = false;
  connect = vi.fn(async () => {
    this.isOpen = true;
    this.isReady = true;
    this.emit("ready");
  });
  destroy = vi.fn(() => {
    this.isOpen = false;
    this.isReady = false;
    this.emit("end");
  });
  ping = vi.fn(async () => "PONG");
  get = vi.fn(async (_key: string): Promise<string | null> => "value");
  set = vi.fn(async () => "OK");
  del = vi.fn(async () => 1);
}

function asRedisClient(client: MockRedisClient): RedisClient {
  return client as unknown as RedisClient;
}

describe("RedisService", () => {
  let client: MockRedisClient;
  let service: RedisService;

  beforeEach(() => {
    client = new MockRedisClient();
    service = new RedisService(asRedisClient(client));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("REDIS_URL未設定相当のclient=nullでは利用不可のまま安全に起動する", async () => {
    const disabled = new RedisService(null);

    await expect(disabled.onModuleInit()).resolves.toBeUndefined();
    expect(disabled.isAvailable()).toBe(false);
    await expect(disabled.ping()).resolves.toEqual({ status: "unavailable" });
    await expect(disabled.get("missing")).resolves.toEqual({ status: "unavailable" });
    await expect(disabled.set("key", "value")).resolves.toEqual({ status: "unavailable" });
    await expect(disabled.delete("key")).resolves.toEqual({ status: "unavailable" });
  });

  it("接続成功で利用可能になりping成功を返す", async () => {
    await service.onModuleInit();

    expect(client.connect).toHaveBeenCalledOnce();
    expect(service.isAvailable()).toBe(true);
    await expect(service.ping()).resolves.toEqual({ status: "ok", value: "PONG" });
  });

  it("接続失敗でも初期化を失敗させず利用不可にする", async () => {
    client.connect.mockRejectedValueOnce(new Error("connect failed"));
    const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.isAvailable()).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "Redis is unavailable; Redis-dependent features must use their fallback",
    );
  });

  it("ping失敗を利用不可結果へ変換する", async () => {
    await service.onModuleInit();
    client.ping.mockRejectedValueOnce(new Error("ping failed"));

    await expect(service.ping()).resolves.toEqual({ status: "unavailable" });
    expect(service.isAvailable()).toBe(false);
  });

  it("getで値とキー不存在nullをRedis利用不可と区別する", async () => {
    await service.onModuleInit();
    await expect(service.get("present")).resolves.toEqual({ status: "ok", value: "value" });

    client.get.mockResolvedValueOnce(null);
    await expect(service.get("missing")).resolves.toEqual({ status: "ok", value: null });
  });

  it("get失敗を利用不可結果へ変換する", async () => {
    await service.onModuleInit();
    client.get.mockRejectedValueOnce(new Error("get failed"));

    await expect(service.get("key")).resolves.toEqual({ status: "unavailable" });
  });

  it("set成功と失敗を一貫した結果型で返す", async () => {
    await service.onModuleInit();
    await expect(service.set("key", "value")).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
    expect(client.set).toHaveBeenCalledWith("key", "value");

    client.set.mockRejectedValueOnce(new Error("set failed"));
    await expect(service.set("key", "value")).resolves.toEqual({ status: "unavailable" });
  });

  it("setWithTtlへ秒単位の有効期限を渡す", async () => {
    await service.onModuleInit();

    await expect(service.setWithTtl("key", "value", 30)).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
    expect(client.set).toHaveBeenCalledWith("key", "value", {
      expiration: { type: "EX", value: 30 },
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "不正TTL %s をRedisへ送らず拒否する",
    async (ttl) => {
      await service.onModuleInit();

      await expect(service.setWithTtl("key", "value", ttl)).rejects.toThrow(
        "ttlSeconds must be a positive safe integer",
      );
      expect(client.set).not.toHaveBeenCalled();
    },
  );

  it("setWithTtl失敗を利用不可結果へ変換する", async () => {
    await service.onModuleInit();
    client.set.mockRejectedValueOnce(new Error("set ttl failed"));

    await expect(service.setWithTtl("key", "value", 30)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("delete成功時は削除数、失敗時は利用不可を返す", async () => {
    await service.onModuleInit();
    await expect(service.delete("key")).resolves.toEqual({ status: "ok", value: 1 });

    client.del.mockRejectedValueOnce(new Error("delete failed"));
    await expect(service.delete("key")).resolves.toEqual({ status: "unavailable" });
  });

  it("ready・reconnectingイベントと操作成功でisAvailableを遷移させる", async () => {
    const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(true);

    client.isReady = false;
    client.emit("reconnecting");
    expect(service.isAvailable()).toBe(false);

    client.isReady = true;
    client.emit("ready");
    expect(service.isAvailable()).toBe(true);

    client.get.mockRejectedValueOnce(new Error("temporary failure"));
    await service.get("key");
    expect(service.isAvailable()).toBe(false);

    await expect(service.get("key")).resolves.toEqual({ status: "ok", value: "value" });
    expect(service.isAvailable()).toBe(true);

    client.get.mockRejectedValueOnce(new Error("another temporary failure"));
    await service.get("key");
    expect(warning).toHaveBeenCalledTimes(3);
  });

  it("shutdown時に開いた接続を破棄する", async () => {
    await service.onModuleInit();

    service.onModuleDestroy();

    expect(client.destroy).toHaveBeenCalledOnce();
    expect(service.isAvailable()).toBe(false);
  });

  it("閉じたclientのshutdownでは二重に破棄しない", () => {
    service.onModuleDestroy();

    expect(client.destroy).not.toHaveBeenCalled();
  });

  it("接続・コマンドエラーの秘密情報を警告へ含めない", async () => {
    const secret = "redis://user:super-secret-password@example.invalid:6379";
    client.connect.mockRejectedValueOnce(new Error(secret));
    const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    await service.onModuleInit();

    const logged = warning.mock.calls.flat().join(" ");
    expect(logged).not.toContain("super-secret-password");
    expect(logged).not.toContain(secret);
  });
});
