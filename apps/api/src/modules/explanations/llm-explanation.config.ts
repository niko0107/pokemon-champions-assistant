export const DEFAULT_LLM_EXPLANATION_CACHE_TTL_SECONDS = 86_400;
export const MIN_LLM_EXPLANATION_CACHE_TTL_SECONDS = 60;
export const MAX_LLM_EXPLANATION_CACHE_TTL_SECONDS = 604_800;
export const LLM_EXPLANATION_CACHE_CONFIG = Symbol("LLM_EXPLANATION_CACHE_CONFIG");

export type LlmExplanationCacheConfig =
  | { readonly enabled: false; readonly reason: "invalid_ttl" }
  | { readonly enabled: true; readonly ttlSeconds: number };

export function resolveLlmExplanationCacheConfig(
  value: string | undefined,
): LlmExplanationCacheConfig {
  if (value === undefined || value.trim().length === 0) {
    return { enabled: true, ttlSeconds: DEFAULT_LLM_EXPLANATION_CACHE_TTL_SECONDS };
  }

  const normalized = value.trim();
  if (!/^[1-9]\d*$/u.test(normalized)) {
    return { enabled: false, reason: "invalid_ttl" };
  }

  const ttlSeconds = Number(normalized);
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_LLM_EXPLANATION_CACHE_TTL_SECONDS ||
    ttlSeconds > MAX_LLM_EXPLANATION_CACHE_TTL_SECONDS
  ) {
    return { enabled: false, reason: "invalid_ttl" };
  }

  return { enabled: true, ttlSeconds };
}
