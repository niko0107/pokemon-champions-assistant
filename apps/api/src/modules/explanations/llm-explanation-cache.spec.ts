import type {
  RedisAdapter,
  RedisIncrementResult,
  RedisOperationResult,
} from "../redis/redis-adapter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExplanationFixture } from "./explanation-test-fixture";
import { LlmExplanationCache } from "./llm-explanation-cache";
import {
  GENERATOR_VERSION,
  LLM_EXPLANATION_FAILURE_TTL_SECONDS,
  OUTPUT_SCHEMA_VERSION,
} from "./llm-explanation.constants";

class MemoryRedis implements RedisAdapter {
  available = true;
  readonly values = new Map<string, string>();
  readonly get = vi.fn(async (key: string): Promise<RedisOperationResult<string | null>> => {
    return this.available
      ? { status: "ok", value: this.values.get(key) ?? null }
      : { status: "unavailable" };
  });
  readonly setWithTtl = vi.fn(
    async (
      key: string,
      value: string,
      _ttlSeconds: number,
    ): Promise<RedisOperationResult<void>> => {
      if (!this.available) {
        return { status: "unavailable" };
      }
      this.values.set(key, value);
      return { status: "ok", value: undefined };
    },
  );
  readonly delete = vi.fn(async (key: string): Promise<RedisOperationResult<number>> => {
    const deleted = this.values.delete(key) ? 1 : 0;
    return this.available ? { status: "ok", value: deleted } : { status: "unavailable" };
  });

  isAvailable(): boolean {
    return this.available;
  }
  async ping(): Promise<RedisOperationResult<"PONG">> {
    return this.available ? { status: "ok", value: "PONG" } : { status: "unavailable" };
  }
  async set(key: string, value: string): Promise<RedisOperationResult<void>> {
    this.values.set(key, value);
    return { status: "ok", value: undefined };
  }
  async incrementWithTtl(): Promise<RedisOperationResult<RedisIncrementResult>> {
    return { status: "unavailable" };
  }
}

describe("LlmExplanationCache", () => {
  const cacheKey = "pca:llm-explanation:v1:abc";
  const failureKey = "pca:llm-explanation-failure:v1:abc";
  const opponentIds = [101];
  let redis: MemoryRedis;
  let cache: LlmExplanationCache;

  beforeEach(() => {
    redis = new MemoryRedis();
    cache = new LlmExplanationCache(redis, { enabled: true, ttlSeconds: 86_400 });
  });

  it("missとstrict検証済みhitを区別しTTL付きで最小envelopeだけ保存する", async () => {
    await expect(cache.read(cacheKey, opponentIds)).resolves.toEqual({ status: "miss" });
    const explanation = createExplanationFixture(opponentIds);
    await expect(cache.write(cacheKey, explanation, opponentIds)).resolves.toBe(true);
    expect(redis.setWithTtl).toHaveBeenCalledWith(cacheKey, expect.any(String), 86_400);
    expect(JSON.parse(redis.values.get(cacheKey)!)).toEqual({
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      explanation,
    });
    await expect(cache.read(cacheKey, opponentIds)).resolves.toEqual({
      status: "hit",
      explanation,
    });
    expect(redis.values.get(cacheKey)).not.toContain("apiKey");
    expect(redis.values.get(cacheKey)).not.toContain("userId");
    expect(redis.values.get(cacheKey)).not.toContain("prompt");
  });

  it.each([
    "broken",
    JSON.stringify({ schemaVersion: 2, generatorVersion: 1, explanation: {} }),
    JSON.stringify({ schemaVersion: 1, generatorVersion: 2, explanation: {} }),
    JSON.stringify({
      schemaVersion: 1,
      generatorVersion: 1,
      explanation: { ...createExplanationFixture(), extra: true },
    }),
    JSON.stringify({
      schemaVersion: 1,
      generatorVersion: 1,
      explanation: createExplanationFixture([999]),
    }),
    JSON.stringify({
      schemaVersion: 1,
      generatorVersion: 1,
      explanation: {
        ...createExplanationFixture(),
        summary: "<script>invalid</script>",
      },
    }),
    JSON.stringify({
      schemaVersion: 1,
      generatorVersion: 1,
      explanation: {
        ...createExplanationFixture(),
        summary: "長".repeat(401),
      },
    }),
  ])("破損・不一致キャッシュをmissとして削除する", async (value) => {
    redis.values.set(cacheKey, value);
    await expect(cache.read(cacheKey, opponentIds)).resolves.toEqual({ status: "miss" });
    expect(redis.delete).toHaveBeenCalledWith(cacheKey);
  });

  it("Redis GET/SET/DELETE失敗を外へ送出しない", async () => {
    redis.available = false;
    await expect(cache.read(cacheKey, opponentIds)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(cache.write(cacheKey, createExplanationFixture(), opponentIds)).resolves.toBe(
      false,
    );

    redis.available = true;
    redis.values.set(cacheKey, "broken");
    redis.delete.mockRejectedValueOnce(new Error("delete failed"));
    await expect(cache.read(cacheKey, opponentIds)).resolves.toEqual({ status: "miss" });
  });

  it("failure markerをstrictに検証し5分TTLで保存する", async () => {
    await expect(cache.readFailure(failureKey)).resolves.toEqual({ status: "miss" });
    await expect(cache.markFailure(failureKey)).resolves.toBe(true);
    expect(redis.setWithTtl).toHaveBeenCalledWith(
      failureKey,
      JSON.stringify({ schemaVersion: 1, failed: true }),
      LLM_EXPLANATION_FAILURE_TTL_SECONDS,
    );
    await expect(cache.readFailure(failureKey)).resolves.toEqual({ status: "hit" });

    redis.values.set(failureKey, JSON.stringify({ schemaVersion: 1, failed: true, reason: "x" }));
    await expect(cache.readFailure(failureKey)).resolves.toEqual({ status: "miss" });
  });
});
