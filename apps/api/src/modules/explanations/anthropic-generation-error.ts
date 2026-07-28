import Anthropic from "@anthropic-ai/sdk";

export type AnthropicFailureCategory =
  | "configuration"
  | "timeout"
  | "authentication"
  | "rate_limit"
  | "server"
  | "network"
  | "invalid_output"
  | "unknown";

export class AnthropicGenerationError extends Error {
  constructor(readonly category: AnthropicFailureCategory) {
    super(`Anthropic explanation generation failed: ${category}`);
    this.name = "AnthropicGenerationError";
  }
}

export function classifyAnthropicSdkError(error: unknown): AnthropicFailureCategory {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "timeout";
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "authentication";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "rate_limit";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "network";
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) {
      return "authentication";
    }
    if (error.status === 429) {
      return "rate_limit";
    }
    if (typeof error.status === "number" && error.status >= 500) {
      return "server";
    }
  }
  return "unknown";
}
