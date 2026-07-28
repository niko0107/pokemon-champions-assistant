import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import {
  ANTHROPIC_CONFIG,
  resolveAnthropicExplanationConfig,
  type AnthropicExplanationConfig,
} from "./anthropic-explanation.config";
import { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import { CachedExplanationOrchestrator } from "./cached-explanation-orchestrator";
import { COUNTERPLAN_EXPLANATION_STATUS } from "./counterplan-explanation-status";
import {
  ANTHROPIC_MESSAGES_CLIENT,
  OfficialAnthropicMessagesClient,
} from "./anthropic-messages.client";
import { EXPLANATION_GENERATOR } from "./explanation-generator";
import { FallbackExplanationGenerator } from "./fallback-explanation-generator";
import { LlmExplanationCache } from "./llm-explanation-cache";
import {
  LLM_EXPLANATION_CACHE_CONFIG,
  resolveLlmExplanationCacheConfig,
} from "./llm-explanation.config";
import { BullMqExplanationQueue, LLM_EXPLANATION_QUEUE } from "./llm-explanation-queue";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

@Module({
  imports: [RedisModule],
  providers: [
    {
      provide: ANTHROPIC_CONFIG,
      useFactory: () =>
        resolveAnthropicExplanationConfig(
          process.env.ANTHROPIC_API_KEY,
          process.env.ANTHROPIC_MODEL,
          process.env.ANTHROPIC_TIMEOUT_MS,
        ),
    },
    {
      provide: LLM_EXPLANATION_CACHE_CONFIG,
      useFactory: () =>
        resolveLlmExplanationCacheConfig(process.env.LLM_EXPLANATION_CACHE_TTL_SECONDS),
    },
    {
      provide: ANTHROPIC_MESSAGES_CLIENT,
      inject: [ANTHROPIC_CONFIG],
      useFactory: (config: AnthropicExplanationConfig) =>
        config.enabled
          ? new OfficialAnthropicMessagesClient(config.apiKey, config.timeoutMs)
          : null,
    },
    TemplateExplanationGenerator,
    AnthropicExplanationGenerator,
    FallbackExplanationGenerator,
    LlmExplanationCache,
    BullMqExplanationQueue,
    {
      provide: LLM_EXPLANATION_QUEUE,
      useExisting: BullMqExplanationQueue,
    },
    CachedExplanationOrchestrator,
    {
      provide: EXPLANATION_GENERATOR,
      useExisting: CachedExplanationOrchestrator,
    },
    {
      provide: COUNTERPLAN_EXPLANATION_STATUS,
      useExisting: CachedExplanationOrchestrator,
    },
  ],
  exports: [
    EXPLANATION_GENERATOR,
    COUNTERPLAN_EXPLANATION_STATUS,
    ANTHROPIC_CONFIG,
    ANTHROPIC_MESSAGES_CLIENT,
    LLM_EXPLANATION_CACHE_CONFIG,
    LLM_EXPLANATION_QUEUE,
  ],
})
export class ExplanationsModule {}
