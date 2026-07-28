import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANTHROPIC_TIMEOUT_MS,
  MAX_ANTHROPIC_TIMEOUT_MS,
  resolveAnthropicExplanationConfig,
} from "./anthropic-explanation.config";

describe("resolveAnthropicExplanationConfig", () => {
  it.each([undefined, "", "   "])("APIキー=%sならAnthropicを無効にする", (apiKey) => {
    expect(resolveAnthropicExplanationConfig(apiKey, "claude-sonnet-4-5", "5000")).toEqual({
      enabled: false,
      reason: "api_key_missing",
    });
  });

  it.each([undefined, "", "   "])("モデル=%sならAnthropicを無効にする", (model) => {
    expect(resolveAnthropicExplanationConfig("test-key", model, "5000")).toEqual({
      enabled: false,
      reason: "model_missing",
    });
  });

  it("APIキー・モデルをtrimし、未指定timeoutへ明示defaultを使う", () => {
    expect(
      resolveAnthropicExplanationConfig("  test-key  ", "  claude-sonnet-4-5  ", undefined),
    ).toEqual({
      enabled: true,
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      timeoutMs: DEFAULT_ANTHROPIC_TIMEOUT_MS,
    });
  });

  it.each([
    ["1", 1],
    ["5000", 5_000],
    [" 5000 ", 5_000],
    [String(MAX_ANTHROPIC_TIMEOUT_MS), MAX_ANTHROPIC_TIMEOUT_MS],
  ])("timeout %sを正の安全な整数として受理する", (value, expected) => {
    expect(resolveAnthropicExplanationConfig("test-key", "claude-sonnet-4-5", value)).toEqual({
      enabled: true,
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      timeoutMs: expected,
    });
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "1e3",
    "0x10",
    "NaN",
    "Infinity",
    String(MAX_ANTHROPIC_TIMEOUT_MS + 1),
    "5000ms",
  ])("不正timeout %sを補正せずAnthropicを無効にする", (value) => {
    expect(resolveAnthropicExplanationConfig("test-key", "claude-sonnet-4-5", value)).toEqual({
      enabled: false,
      reason: "invalid_timeout",
    });
  });
});
