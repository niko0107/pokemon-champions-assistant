import { Inject, Injectable } from "@nestjs/common";
import {
  battleCandidatesResponseSchema,
  type BattleCandidatesResponse,
} from "@pokemon-champions/shared";
import { REDIS_ADAPTER, type RedisAdapter } from "../redis/redis-adapter";

export const DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS = 30;

export function resolveBattleCandidatesCacheTtlSeconds(
  configuredValue: string | undefined,
): number {
  if (configuredValue === undefined || configuredValue.trim().length === 0) {
    return DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS;
  }

  const value = Number(configuredValue);
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_BATTLE_CANDIDATES_CACHE_TTL_SECONDS;
}

export type BattleCandidatesCalculation = () =>
  BattleCandidatesResponse | Promise<BattleCandidatesResponse>;

@Injectable()
export class BattleCandidatesCache {
  private readonly ttlSeconds = resolveBattleCandidatesCacheTtlSeconds(
    process.env.BATTLE_CANDIDATES_CACHE_TTL_SECONDS,
  );

  constructor(@Inject(REDIS_ADAPTER) private readonly redis: RedisAdapter) {}

  async getOrCalculate(
    key: string,
    expectedSessionId: string,
    calculation: BattleCandidatesCalculation,
  ): Promise<BattleCandidatesResponse> {
    const cached = await this.read(key, expectedSessionId);
    if (cached !== null) {
      return cached;
    }

    const response = battleCandidatesResponseSchema.parse(await calculation());
    await this.write(key, response);
    return response;
  }

  private async read(
    key: string,
    expectedSessionId: string,
  ): Promise<BattleCandidatesResponse | null> {
    if (!this.redis.isAvailable()) {
      return null;
    }

    try {
      const result = await this.redis.get(key);
      if (result.status === "unavailable" || result.value === null) {
        return null;
      }

      const parsedJson: unknown = JSON.parse(result.value);
      const parsedResponse = battleCandidatesResponseSchema.safeParse(parsedJson);
      if (!parsedResponse.success || parsedResponse.data.sessionId !== expectedSessionId) {
        await this.deleteInvalidEntry(key);
        return null;
      }

      return parsedResponse.data;
    } catch {
      await this.deleteInvalidEntry(key);
      return null;
    }
  }

  private async write(key: string, response: BattleCandidatesResponse): Promise<void> {
    if (!this.redis.isAvailable()) {
      return;
    }

    try {
      const validated = battleCandidatesResponseSchema.parse(response);
      await this.redis.setWithTtl(key, JSON.stringify(validated), this.ttlSeconds);
    } catch {
      // Redisは補助基盤のため、保存失敗では正常なDB計算結果を優先する。
    }
  }

  private async deleteInvalidEntry(key: string): Promise<void> {
    if (!this.redis.isAvailable()) {
      return;
    }

    try {
      await this.redis.delete(key);
    } catch {
      // 破損キャッシュの削除失敗もリクエスト失敗へ昇格させない。
    }
  }
}
