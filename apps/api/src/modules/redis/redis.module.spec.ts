import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDIS_ADAPTER, type RedisAdapter } from "./redis-adapter";
import { REDIS_CLIENT, createRedisClientFromUrl, type RedisClient } from "./redis-client.provider";
import { RedisModule } from "./redis.module";
import { RedisService } from "./redis.service";

class ModuleRedisClient extends EventEmitter {
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
  });
  ping = vi.fn(async () => "PONG");
  get = vi.fn(async () => null);
  set = vi.fn(async () => "OK");
  eval = vi.fn(async () => [1, 60]);
  del = vi.fn(async () => 0);
}

describe("RedisModule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("未設定ではclientを作成しない", () => {
    expect(createRedisClientFromUrl(undefined)).toBeNull();
    expect(createRedisClientFromUrl("   ")).toBeNull();
  });

  it.each(["not-a-url", "http://localhost:6379", "redis://", "redis:///0"])(
    "malformedまたは非Redis URLを秘密なしの警告で無効化する: %s",
    (url) => {
      const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

      expect(createRedisClientFromUrl(url)).toBeNull();
      expect(warning).toHaveBeenCalledWith("REDIS_URL is invalid; Redis adapter is disabled");
      expect(warning.mock.calls.flat().join(" ")).not.toContain(url);
    },
  );

  it("redis/rediss URLから具体clientを生成する", () => {
    const redisClient = createRedisClientFromUrl("redis://localhost:6379");
    const secureClient = createRedisClientFromUrl("rediss://localhost:6380");

    expect(redisClient).not.toBeNull();
    expect(secureClient).not.toBeNull();
    expect(redisClient?.isOpen).toBe(false);
    expect(secureClient?.isOpen).toBe(false);
  });

  it("Global moduleからtoken経由でアダプターをDIできる", async () => {
    const client = new ModuleRedisClient();
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(client as unknown as RedisClient)
      .compile();

    await moduleRef.init();
    const adapter = moduleRef.get<RedisAdapter>(REDIS_ADAPTER);

    expect(adapter).toBeInstanceOf(RedisService);
    expect(adapter.isAvailable()).toBe(true);
    await expect(adapter.ping()).resolves.toEqual({ status: "ok", value: "PONG" });
    await moduleRef.close();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("Redis未設定でもNest moduleが起動する", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(null)
      .compile();

    await expect(moduleRef.init()).resolves.toBeDefined();
    expect(moduleRef.get<RedisAdapter>(REDIS_ADAPTER).isAvailable()).toBe(false);
    await moduleRef.close();
  });

  it("Redis停止相当の接続失敗でもNest moduleが起動する", async () => {
    const client = new ModuleRedisClient();
    client.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(client as unknown as RedisClient)
      .compile();

    await expect(moduleRef.init()).resolves.toBeDefined();
    expect(moduleRef.get<RedisAdapter>(REDIS_ADAPTER).isAvailable()).toBe(false);
    expect(warning).toHaveBeenCalled();
    await moduleRef.close();
  });
});
