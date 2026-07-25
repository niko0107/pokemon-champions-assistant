import type {
  RedisAdapter,
  RedisIncrementResult,
  RedisOperationResult,
} from "../redis/redis-adapter";
import { describe, expect, it } from "vitest";
import { BattleRateLimitService, buildObservationRateLimitKey } from "./battle-rate-limit.service";

interface Counter {
  count: number;
  expiresAt: number;
}

class MemoryRateLimitRedisAdapter implements RedisAdapter {
  available = true;
  failIncrement = false;
  now = 0;
  readonly counters = new Map<string, Counter>();
  readonly ttlArguments: number[] = [];

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<RedisOperationResult<"PONG">> {
    return this.available ? { status: "ok", value: "PONG" } : { status: "unavailable" };
  }

  async get(): Promise<RedisOperationResult<string | null>> {
    return { status: "ok", value: null };
  }

  async set(): Promise<RedisOperationResult<void>> {
    return { status: "ok", value: undefined };
  }

  async setWithTtl(): Promise<RedisOperationResult<void>> {
    return { status: "ok", value: undefined };
  }

  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<RedisOperationResult<RedisIncrementResult>> {
    if (!this.available || this.failIncrement) {
      return { status: "unavailable" };
    }

    this.ttlArguments.push(ttlSeconds);
    const current = this.counters.get(key);
    const counter =
      current === undefined || current.expiresAt <= this.now
        ? { count: 0, expiresAt: this.now + ttlSeconds * 1_000 }
        : current;
    counter.count += 1;
    this.counters.set(key, counter);

    return {
      status: "ok",
      value: {
        count: counter.count,
        ttlSeconds: Math.max(0, Math.ceil((counter.expiresAt - this.now) / 1_000)),
      },
    };
  }

  async delete(): Promise<RedisOperationResult<number>> {
    return { status: "ok", value: 0 };
  }
}

const userAId = "fecccd4a-a137-4b3b-bb09-239306040706";
const userBId = "95335a95-31d1-429d-87e3-8921d2b05d08";

describe("BattleRateLimitService", () => {
  it("上限ちょうどまで許可し、超過時は残りウィンドウを返す", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const service = new BattleRateLimitService(redis, { limit: 2, windowSeconds: 10 });

    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
    await expect(service.consumeObservation(userAId)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(redis.ttlArguments).toEqual([10, 10, 10]);
  });

  it("ウィンドウ終了後は再び許可し、カウンタキーにTTLを残す", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const service = new BattleRateLimitService(redis, { limit: 1, windowSeconds: 10 });

    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
    await expect(service.consumeObservation(userAId)).resolves.toMatchObject({ allowed: false });
    redis.now = 10_000;
    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });

    expect(redis.counters.get(buildObservationRateLimitKey(userAId))?.expiresAt).toBe(20_000);
  });

  it("別ユーザーは独立したカウンタを利用する", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const service = new BattleRateLimitService(redis, { limit: 1, windowSeconds: 60 });

    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
    await expect(service.consumeObservation(userAId)).resolves.toMatchObject({ allowed: false });
    await expect(service.consumeObservation(userBId)).resolves.toEqual({ allowed: true });
    expect(redis.counters).toHaveLength(2);
  });

  it("同時リクエストでも原子的カウンタにより上限を超えて許可しない", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const service = new BattleRateLimitService(redis, { limit: 20, windowSeconds: 60 });

    const decisions = await Promise.all(
      Array.from({ length: 100 }, () => service.consumeObservation(userAId)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(20);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(80);
  });

  it("Redis未設定・停止・操作失敗ではfail-openし、復旧後は制限を再開する", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const service = new BattleRateLimitService(redis, { limit: 1, windowSeconds: 60 });

    redis.available = false;
    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });

    redis.available = true;
    redis.failIncrement = true;
    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });

    redis.failIncrement = false;
    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
    await expect(service.consumeObservation(userAId)).resolves.toMatchObject({ allowed: false });
  });

  it("RedisAdapterが例外を送出しても秘密情報を露出せずfail-openする", async () => {
    const redis = new MemoryRateLimitRedisAdapter();
    const secret = "redis://user:super-secret-password@example.invalid:6379";
    redis.incrementWithTtl = async () => {
      throw new Error(secret);
    };
    const service = new BattleRateLimitService(redis, { limit: 1, windowSeconds: 60 });

    await expect(service.consumeObservation(userAId)).resolves.toEqual({ allowed: true });
  });
});
