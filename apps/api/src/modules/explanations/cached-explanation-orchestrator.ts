import { Inject, Injectable } from "@nestjs/common";
import type { CounterplanResult } from "@pokemon-champions/matchup";
import type {
  CounterplanExplanation,
  SessionCounterplanExplanationStatusResponse,
} from "@pokemon-champions/shared";
import { ANTHROPIC_CONFIG, type AnthropicExplanationConfig } from "./anthropic-explanation.config";
import type { CounterplanExplanationStatusReader } from "./counterplan-explanation-status";
import type { ExplanationGenerator } from "./explanation-generator";
import { LlmExplanationCache } from "./llm-explanation-cache";
import {
  LLM_EXPLANATION_CACHE_CONFIG,
  type LlmExplanationCacheConfig,
} from "./llm-explanation.config";
import { buildLlmExplanationCacheKey } from "./llm-explanation-cache-key";
import { LLM_EXPLANATION_QUEUE, type ExplanationQueue } from "./llm-explanation-queue";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

@Injectable()
export class CachedExplanationOrchestrator
  implements ExplanationGenerator, CounterplanExplanationStatusReader
{
  constructor(
    @Inject(ANTHROPIC_CONFIG)
    private readonly anthropicConfig: AnthropicExplanationConfig,
    @Inject(LLM_EXPLANATION_CACHE_CONFIG)
    private readonly cacheConfig: LlmExplanationCacheConfig,
    private readonly cache: LlmExplanationCache,
    @Inject(LLM_EXPLANATION_QUEUE)
    private readonly queue: ExplanationQueue,
    private readonly template: TemplateExplanationGenerator,
  ) {}

  async generateCounterplanExplanation(input: CounterplanResult): Promise<CounterplanExplanation> {
    const anthropicConfig = this.anthropicConfig;
    if (!anthropicConfig.enabled || !this.cacheConfig.enabled) {
      return this.template.generateCounterplanExplanation(input);
    }

    const key = buildLlmExplanationCacheKey(input, anthropicConfig.model);
    const opponentPokemonIds = input.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId);
    const cached = await this.cache.read(key.cacheKey, opponentPokemonIds);
    if (cached.status === "hit") {
      return cached.explanation;
    }

    const template = await this.template.generateCounterplanExplanation(input);
    if (cached.status === "unavailable" || !this.queue.isAvailable()) {
      return template;
    }

    const failure = await this.cache.readFailure(key.failureKey);
    if (failure.status !== "miss") {
      return template;
    }
    await this.queue.enqueue(input, key);
    return template;
  }

  async getCounterplanExplanationStatus(
    input: CounterplanResult,
  ): Promise<SessionCounterplanExplanationStatusResponse> {
    const anthropicConfig = this.anthropicConfig;
    if (!anthropicConfig.enabled || !this.cacheConfig.enabled) {
      return { status: "unavailable", explanation: null };
    }

    const key = buildLlmExplanationCacheKey(input, anthropicConfig.model);
    const cached = await this.cache.read(
      key.cacheKey,
      input.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId),
    );
    if (cached.status === "hit") {
      return { status: "ready", explanation: cached.explanation };
    }
    if (cached.status === "unavailable" || !this.queue.isAvailable()) {
      return { status: "unavailable", explanation: null };
    }

    const failure = await this.cache.readFailure(key.failureKey);
    if (failure.status === "hit") {
      return { status: "failed", explanation: null };
    }
    if (failure.status === "unavailable") {
      return { status: "unavailable", explanation: null };
    }

    const enqueued = await this.queue.enqueue(input, key);
    return enqueued === "unavailable"
      ? { status: "unavailable", explanation: null }
      : { status: "pending", explanation: null };
  }
}
