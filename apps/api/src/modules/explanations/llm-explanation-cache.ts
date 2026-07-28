import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CounterplanExplanation } from "@pokemon-champions/shared";
import { z } from "zod/v4";
import { REDIS_ADAPTER, type RedisAdapter } from "../redis/redis-adapter";
import { parseAnthropicCounterplanExplanation } from "./anthropic-explanation-output";
import {
  GENERATOR_VERSION,
  LLM_EXPLANATION_FAILURE_TTL_SECONDS,
  OUTPUT_SCHEMA_VERSION,
} from "./llm-explanation.constants";
import {
  LLM_EXPLANATION_CACHE_CONFIG,
  type LlmExplanationCacheConfig,
} from "./llm-explanation.config";

const cacheEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(OUTPUT_SCHEMA_VERSION),
  generatorVersion: z.literal(GENERATOR_VERSION),
  explanation: z.unknown(),
});

const failureMarkerSchema = z.strictObject({
  schemaVersion: z.literal(OUTPUT_SCHEMA_VERSION),
  failed: z.literal(true),
});

export type ExplanationCacheReadResult =
  | { readonly status: "hit"; readonly explanation: CounterplanExplanation }
  | { readonly status: "miss" }
  | { readonly status: "unavailable" };

export type FailureMarkerReadResult =
  { readonly status: "hit" } | { readonly status: "miss" } | { readonly status: "unavailable" };

@Injectable()
export class LlmExplanationCache {
  private readonly logger = new Logger(LlmExplanationCache.name);

  constructor(
    @Inject(REDIS_ADAPTER) private readonly redis: RedisAdapter,
    @Inject(LLM_EXPLANATION_CACHE_CONFIG)
    private readonly config: LlmExplanationCacheConfig,
  ) {}

  isConfigured(): boolean {
    return this.config.enabled;
  }

  async read(
    cacheKey: string,
    expectedOpponentPokemonIds: readonly number[],
  ): Promise<ExplanationCacheReadResult> {
    if (!this.config.enabled || !this.redis.isAvailable()) {
      this.logger.warn("redis_unavailable");
      return { status: "unavailable" };
    }

    try {
      const result = await this.redis.get(cacheKey);
      if (result.status === "unavailable") {
        this.logger.warn("redis_unavailable");
        return { status: "unavailable" };
      }
      if (result.value === null) {
        this.logger.log("cache_miss");
        return { status: "miss" };
      }

      try {
        const raw: unknown = JSON.parse(result.value);
        const envelope = cacheEnvelopeSchema.parse(raw);
        const explanation = parseAnthropicCounterplanExplanation(
          envelope.explanation,
          expectedOpponentPokemonIds,
        );
        this.logger.log("cache_hit");
        return { status: "hit", explanation };
      } catch {
        this.logger.warn("cache_invalid");
        await this.deleteBestEffort(cacheKey);
        return { status: "miss" };
      }
    } catch {
      this.logger.warn("redis_unavailable");
      return { status: "unavailable" };
    }
  }

  async write(
    cacheKey: string,
    explanation: CounterplanExplanation,
    expectedOpponentPokemonIds: readonly number[],
  ): Promise<boolean> {
    if (!this.config.enabled || !this.redis.isAvailable()) {
      this.logger.warn("redis_unavailable");
      return false;
    }

    try {
      const validated = parseAnthropicCounterplanExplanation(
        explanation,
        expectedOpponentPokemonIds,
      );
      const serialized = JSON.stringify({
        schemaVersion: OUTPUT_SCHEMA_VERSION,
        generatorVersion: GENERATOR_VERSION,
        explanation: validated,
      });
      const result = await this.redis.setWithTtl(cacheKey, serialized, this.config.ttlSeconds);
      if (result.status === "unavailable") {
        this.logger.warn("redis_unavailable");
        return false;
      }
      return true;
    } catch {
      this.logger.warn("redis_unavailable");
      return false;
    }
  }

  async readFailure(failureKey: string): Promise<FailureMarkerReadResult> {
    if (!this.config.enabled || !this.redis.isAvailable()) {
      this.logger.warn("redis_unavailable");
      return { status: "unavailable" };
    }

    try {
      const result = await this.redis.get(failureKey);
      if (result.status === "unavailable") {
        this.logger.warn("redis_unavailable");
        return { status: "unavailable" };
      }
      if (result.value === null) {
        return { status: "miss" };
      }
      try {
        failureMarkerSchema.parse(JSON.parse(result.value));
        return { status: "hit" };
      } catch {
        this.logger.warn("cache_invalid");
        await this.deleteBestEffort(failureKey);
        return { status: "miss" };
      }
    } catch {
      this.logger.warn("redis_unavailable");
      return { status: "unavailable" };
    }
  }

  async markFailure(failureKey: string): Promise<boolean> {
    if (!this.config.enabled || !this.redis.isAvailable()) {
      this.logger.warn("redis_unavailable");
      return false;
    }
    try {
      const result = await this.redis.setWithTtl(
        failureKey,
        JSON.stringify({ schemaVersion: OUTPUT_SCHEMA_VERSION, failed: true }),
        LLM_EXPLANATION_FAILURE_TTL_SECONDS,
      );
      if (result.status === "unavailable") {
        this.logger.warn("redis_unavailable");
        return false;
      }
      return true;
    } catch {
      this.logger.warn("redis_unavailable");
      return false;
    }
  }

  private async deleteBestEffort(key: string): Promise<void> {
    try {
      await this.redis.delete(key);
    } catch {
      // 破損キャッシュ削除はbest-effortであり、API応答を失敗させない。
    }
  }
}
