import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_EXPLANATION_CACHE_TTL_SECONDS,
  MAX_LLM_EXPLANATION_CACHE_TTL_SECONDS,
  MIN_LLM_EXPLANATION_CACHE_TTL_SECONDS,
  resolveLlmExplanationCacheConfig,
} from "./llm-explanation.config";

describe("resolveLlmExplanationCacheConfig", () => {
  it.each([undefined, "", "   "])("未設定相当%sは既定86400秒", (value) => {
    expect(resolveLlmExplanationCacheConfig(value)).toEqual({
      enabled: true,
      ttlSeconds: DEFAULT_LLM_EXPLANATION_CACHE_TTL_SECONDS,
    });
  });

  it.each([
    [String(MIN_LLM_EXPLANATION_CACHE_TTL_SECONDS), MIN_LLM_EXPLANATION_CACHE_TTL_SECONDS],
    ["86400", 86_400],
    [String(MAX_LLM_EXPLANATION_CACHE_TTL_SECONDS), MAX_LLM_EXPLANATION_CACHE_TTL_SECONDS],
  ])("%sを有効なTTL %sとして受理する", (value, expected) => {
    expect(resolveLlmExplanationCacheConfig(value)).toEqual({
      enabled: true,
      ttlSeconds: expected,
    });
  });

  it.each(["59", "604801", "0", "-1", "60.5", "NaN", "Infinity", "1e3", "0x100"])(
    "不正値%sは補正せず非同期機能を無効にする",
    (value) => {
      expect(resolveLlmExplanationCacheConfig(value)).toEqual({
        enabled: false,
        reason: "invalid_ttl",
      });
    },
  );
});
