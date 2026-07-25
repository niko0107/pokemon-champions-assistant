import type { RedisAdapter, RedisOperationResult } from "../redis/redis-adapter";
import type { BattleCandidatesResponse } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BattleCandidatesCache,
  DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS,
  resolveBattleCandidatesCacheTtlSeconds,
} from "./session-candidates-cache";

const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const otherSessionId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const cacheKey = `battle:candidates:v1:${sessionId}:version`;

const candidateResponse: BattleCandidatesResponse = {
  sessionId,
  candidates: [
    {
      archetypeId: "11111111-1111-4111-8111-111111111111",
      name: "展開構築",
      matchRate: 100,
      rank: 1,
      popularityTier: "high",
      matched: [
        {
          observationSeq: 1,
          kind: "pokemon",
          matched: true,
          points: 10,
          pokemonId: 10,
        },
      ],
      contradictions: [],
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 11, usageRate: 0.8 }],
      threatMoveIds: [40],
    },
  ],
};

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

class MemoryRedisAdapter implements RedisAdapter {
  available = true;
  now = 0;
  readonly values = new Map<string, StoredValue>();
  readonly get = vi.fn(async (key: string): Promise<RedisOperationResult<string | null>> => {
    const entry = this.values.get(key);
    if (entry?.expiresAt !== null && entry !== undefined && entry.expiresAt <= this.now) {
      this.values.delete(key);
      return { status: "ok", value: null };
    }
    return { status: "ok", value: entry?.value ?? null };
  });
  readonly setWithTtl = vi.fn(
    async (key: string, value: string, ttlSeconds: number): Promise<RedisOperationResult<void>> => {
      this.values.set(key, {
        value,
        expiresAt: this.now + ttlSeconds * 1_000,
      });
      return { status: "ok", value: undefined };
    },
  );
  readonly delete = vi.fn(async (key: string): Promise<RedisOperationResult<number>> => {
    const deleted = this.values.delete(key);
    return { status: "ok", value: deleted ? 1 : 0 };
  });

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<RedisOperationResult<"PONG">> {
    return this.available ? { status: "ok", value: "PONG" } : { status: "unavailable" };
  }

  async set(key: string, value: string): Promise<RedisOperationResult<void>> {
    this.values.set(key, { value, expiresAt: null });
    return { status: "ok", value: undefined };
  }
}

describe("BattleCandidatesCache", () => {
  let redis: MemoryRedisAdapter;
  let cache: BattleCandidatesCache;

  beforeEach(() => {
    redis = new MemoryRedisAdapter();
    cache = new BattleCandidatesCache(redis);
  });

  it("初回missで計算・Zod検証・TTL付き保存し、2回目hitでは計算しない", async () => {
    const calculate = vi.fn(async () => candidateResponse);

    await expect(cache.getOrCalculate(cacheKey, sessionId, calculate)).resolves.toEqual(
      candidateResponse,
    );
    await expect(cache.getOrCalculate(cacheKey, sessionId, calculate)).resolves.toEqual(
      candidateResponse,
    );

    expect(calculate).toHaveBeenCalledOnce();
    expect(redis.setWithTtl).toHaveBeenCalledWith(
      cacheKey,
      JSON.stringify(candidateResponse),
      DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS,
    );
  });

  it("候補0件もキャッシュし、hitでscore/rankを含む計算callbackを呼ばない", async () => {
    const emptyResponse: BattleCandidatesResponse = {
      sessionId,
      candidates: [],
    };
    redis.values.set(cacheKey, {
      value: JSON.stringify(emptyResponse),
      expiresAt: null,
    });
    const calculate = vi.fn(async () => candidateResponse);

    await expect(cache.getOrCalculate(cacheKey, sessionId, calculate)).resolves.toEqual(
      emptyResponse,
    );
    expect(calculate).not.toHaveBeenCalled();
    expect(redis.setWithTtl).not.toHaveBeenCalled();
  });

  it("hit後も順位・人気度・likelyUnseen・threatMoveIdsを維持する", async () => {
    redis.values.set(cacheKey, {
      value: JSON.stringify(candidateResponse),
      expiresAt: null,
    });

    const response = await cache.getOrCalculate(
      cacheKey,
      sessionId,
      vi.fn(async () => ({ sessionId, candidates: [] })),
    );

    expect(response.candidates[0]).toMatchObject({
      rank: 1,
      popularityTier: "high",
      likelyUnseen: [{ pokemonId: 11, usageRate: 0.8 }],
      threatMoveIds: [40],
    });
  });

  it("Redis未設定・停止相当ではDB計算へフォールバックする", async () => {
    redis.available = false;
    const calculate = vi.fn(async () => candidateResponse);

    await expect(cache.getOrCalculate(cacheKey, sessionId, calculate)).resolves.toEqual(
      candidateResponse,
    );
    expect(calculate).toHaveBeenCalledOnce();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.setWithTtl).not.toHaveBeenCalled();
  });

  it("get失敗・利用不可ではDB計算へフォールバックする", async () => {
    redis.get.mockRejectedValueOnce(new Error("Redis get failed"));
    const firstCalculation = vi.fn(async () => candidateResponse);
    await expect(cache.getOrCalculate(cacheKey, sessionId, firstCalculation)).resolves.toEqual(
      candidateResponse,
    );

    redis.get.mockResolvedValueOnce({ status: "unavailable" });
    const secondCalculation = vi.fn(async () => candidateResponse);
    await expect(
      cache.getOrCalculate(`${cacheKey}:2`, sessionId, secondCalculation),
    ).resolves.toEqual(candidateResponse);

    expect(firstCalculation).toHaveBeenCalledOnce();
    expect(secondCalculation).toHaveBeenCalledOnce();
  });

  it("set失敗でも正常なDB計算レスポンスを返す", async () => {
    redis.setWithTtl.mockRejectedValueOnce(new Error("Redis set failed"));

    await expect(
      cache.getOrCalculate(cacheKey, sessionId, async () => candidateResponse),
    ).resolves.toEqual(candidateResponse);
  });

  it.each([
    ["不正JSON", "not-json"],
    ["schema不一致", JSON.stringify({ ...candidateResponse, userId: "internal" })],
    ["別Sessionのレスポンス", JSON.stringify({ ...candidateResponse, sessionId: otherSessionId })],
  ])("%sを破棄してDB計算へフォールバックする", async (_label, value) => {
    redis.values.set(cacheKey, { value, expiresAt: null });
    const calculate = vi.fn(async () => candidateResponse);

    await expect(cache.getOrCalculate(cacheKey, sessionId, calculate)).resolves.toEqual(
      candidateResponse,
    );
    expect(calculate).toHaveBeenCalledOnce();
    expect(redis.delete).toHaveBeenCalledWith(cacheKey);
  });

  it("TTL切れ後は再計算して再保存する", async () => {
    const calculate = vi.fn(async () => candidateResponse);
    await cache.getOrCalculate(cacheKey, sessionId, calculate);
    redis.now += DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS * 1_000 + 1;

    await cache.getOrCalculate(cacheKey, sessionId, calculate);

    expect(calculate).toHaveBeenCalledTimes(2);
    expect(redis.setWithTtl).toHaveBeenCalledTimes(2);
  });
});

describe("resolveBattleCandidatesCacheTtlSeconds", () => {
  it.each([undefined, "", "  "])("未設定 %s では短い既定値を返す", (value) => {
    expect(resolveBattleCandidatesCacheTtlSeconds(value)).toBe(
      DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS,
    );
  });

  it("正の安全な整数を採用する", () => {
    expect(resolveBattleCandidatesCacheTtlSeconds("60")).toBe(60);
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])(
    "不正値 %s は安全な既定値へフォールバックする",
    (value) => {
      expect(resolveBattleCandidatesCacheTtlSeconds(value)).toBe(
        DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS,
      );
    },
  );
});
