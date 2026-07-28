import { Module } from "@nestjs/common";
import {
  ANTHROPIC_CONFIG,
  resolveAnthropicExplanationConfig,
  type AnthropicExplanationConfig,
} from "./anthropic-explanation.config";
import { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import {
  ANTHROPIC_MESSAGES_CLIENT,
  OfficialAnthropicMessagesClient,
} from "./anthropic-messages.client";
import { EXPLANATION_GENERATOR } from "./explanation-generator";
import { FallbackExplanationGenerator } from "./fallback-explanation-generator";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

@Module({
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
    {
      provide: EXPLANATION_GENERATOR,
      useExisting: FallbackExplanationGenerator,
    },
  ],
  exports: [EXPLANATION_GENERATOR, ANTHROPIC_CONFIG, ANTHROPIC_MESSAGES_CLIENT],
})
export class ExplanationsModule {}
