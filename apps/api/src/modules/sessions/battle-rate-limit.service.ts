import { Inject, Injectable } from "@nestjs/common";
import { REDIS_ADAPTER, type RedisAdapter } from "../redis/redis-adapter";
import { BATTLE_RATE_LIMIT_CONFIG, type BattleRateLimitConfig } from "./battle-rate-limit.config";

const OBSERVATION_RATE_LIMIT_KEY_PREFIX = "battle:rate:v1";
const OBSERVATION_RATE_LIMIT_GROUP = "observations";

export type BattleRateLimitDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function buildObservationRateLimitKey(userId: string): string {
  return `${OBSERVATION_RATE_LIMIT_KEY_PREFIX}:${userId}:${OBSERVATION_RATE_LIMIT_GROUP}`;
}

@Injectable()
export class BattleRateLimitService {
  constructor(
    @Inject(REDIS_ADAPTER) private readonly redis: RedisAdapter,
    @Inject(BATTLE_RATE_LIMIT_CONFIG) private readonly config: BattleRateLimitConfig,
  ) {}

  async consumeObservation(userId: string): Promise<BattleRateLimitDecision> {
    if (!this.redis.isAvailable()) {
      return { allowed: true };
    }

    try {
      const result = await this.redis.incrementWithTtl(
        buildObservationRateLimitKey(userId),
        this.config.windowSeconds,
      );
      if (result.status === "unavailable") {
        return { allowed: true };
      }
      if (result.value.count <= this.config.limit) {
        return { allowed: true };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, result.value.ttlSeconds),
      };
    } catch {
      // Redisは補助基盤のため、障害やtimeout時は既存APIの可用性を優先する。
      return { allowed: true };
    }
  }
}
