import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CounterplanResult } from "@pokemon-champions/matchup";
import type { CounterplanExplanation } from "@pokemon-champions/shared";
import { ANTHROPIC_CONFIG, type AnthropicExplanationConfig } from "./anthropic-explanation.config";
import { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import { AnthropicGenerationError } from "./anthropic-generation-error";
import type { ExplanationGenerator } from "./explanation-generator";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

@Injectable()
export class FallbackExplanationGenerator implements ExplanationGenerator {
  private readonly logger = new Logger(FallbackExplanationGenerator.name);

  constructor(
    @Inject(ANTHROPIC_CONFIG)
    private readonly config: AnthropicExplanationConfig,
    private readonly anthropic: AnthropicExplanationGenerator,
    private readonly template: TemplateExplanationGenerator,
  ) {}

  async generateCounterplanExplanation(input: CounterplanResult): Promise<CounterplanExplanation> {
    if (!this.anthropic.isEnabled()) {
      if (!this.config.enabled && this.config.reason !== "api_key_missing") {
        this.logger.warn("Anthropic explanation fallback category=configuration");
      }
      return this.template.generateCounterplanExplanation(input);
    }

    const startedAt = performance.now();
    try {
      const explanation = await this.anthropic.generateCounterplanExplanation(input);
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      this.logger.log(`Anthropic explanation generated durationMs=${durationMs}`);
      return explanation;
    } catch (error: unknown) {
      const category =
        error instanceof AnthropicGenerationError ? error.category : ("unknown" as const);
      this.logger.warn(`Anthropic explanation fallback category=${category}`);
      return this.template.generateCounterplanExplanation(input);
    }
  }
}
