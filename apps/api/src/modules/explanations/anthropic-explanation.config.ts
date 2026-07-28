export const DEFAULT_ANTHROPIC_TIMEOUT_MS = 5_000;
export const MAX_ANTHROPIC_TIMEOUT_MS = 15_000;
export const ANTHROPIC_CONFIG = Symbol("ANTHROPIC_CONFIG");

export type AnthropicDisabledReason = "api_key_missing" | "model_missing" | "invalid_timeout";

export type AnthropicExplanationConfig =
  | {
      readonly enabled: false;
      readonly reason: AnthropicDisabledReason;
    }
  | {
      readonly enabled: true;
      readonly apiKey: string;
      readonly model: string;
      readonly timeoutMs: number;
    };

function resolveTimeout(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_ANTHROPIC_TIMEOUT_MS;
  }

  const normalized = value.trim();
  if (!/^[1-9]\d*$/u.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_ANTHROPIC_TIMEOUT_MS
    ? parsed
    : null;
}

export function resolveAnthropicExplanationConfig(
  apiKey: string | undefined,
  model: string | undefined,
  timeoutMs: string | undefined,
): AnthropicExplanationConfig {
  const normalizedApiKey = apiKey?.trim() ?? "";
  if (normalizedApiKey.length === 0) {
    return { enabled: false, reason: "api_key_missing" };
  }

  const normalizedModel = model?.trim() ?? "";
  if (normalizedModel.length === 0) {
    return { enabled: false, reason: "model_missing" };
  }

  const resolvedTimeout = resolveTimeout(timeoutMs);
  if (resolvedTimeout === null) {
    return { enabled: false, reason: "invalid_timeout" };
  }

  return {
    enabled: true,
    apiKey: normalizedApiKey,
    model: normalizedModel,
    timeoutMs: resolvedTimeout,
  };
}
