import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicCounterplanExplanationSchema } from "./anthropic-explanation-output";

export const ANTHROPIC_MESSAGES_CLIENT = Symbol("ANTHROPIC_MESSAGES_CLIENT");
export const ANTHROPIC_MAX_OUTPUT_TOKENS = 2_048;
export const ANTHROPIC_SDK_MAX_RETRIES = 0;

export interface AnthropicExplanationMessageRequest {
  readonly model: string;
  readonly timeoutMs: number;
  readonly system: string;
  readonly user: string;
}

export interface AnthropicExplanationContentBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AnthropicExplanationMessageResponse {
  readonly stopReason: string | null;
  readonly content: readonly AnthropicExplanationContentBlock[];
}

export interface AnthropicMessagesClient {
  createExplanationMessage(
    request: AnthropicExplanationMessageRequest,
  ): Promise<AnthropicExplanationMessageResponse>;
}

export class OfficialAnthropicMessagesClient implements AnthropicMessagesClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, timeoutMs: number) {
    this.client = new Anthropic({
      apiKey,
      timeout: timeoutMs,
      maxRetries: ANTHROPIC_SDK_MAX_RETRIES,
    });
  }

  async createExplanationMessage(
    request: AnthropicExplanationMessageRequest,
  ): Promise<AnthropicExplanationMessageResponse> {
    const message = await this.client.messages.create(
      {
        model: request.model,
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        temperature: 0,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: {
          format: zodOutputFormat(anthropicCounterplanExplanationSchema),
        },
      },
      {
        timeout: request.timeoutMs,
        maxRetries: ANTHROPIC_SDK_MAX_RETRIES,
      },
    );

    return {
      stopReason: message.stop_reason,
      content: message.content.map((block) =>
        block.type === "text" ? { type: "text", text: block.text } : { type: block.type },
      ),
    };
  }
}
