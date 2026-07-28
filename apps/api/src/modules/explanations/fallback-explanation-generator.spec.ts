import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnthropicExplanationConfig } from "./anthropic-explanation.config";
import { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import {
  AnthropicGenerationError,
  type AnthropicFailureCategory,
} from "./anthropic-generation-error";
import type { AnthropicMessagesClient } from "./anthropic-messages.client";
import { createCounterplanFixture, createExplanationFixture } from "./explanation-test-fixture";
import { FallbackExplanationGenerator } from "./fallback-explanation-generator";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

const enabledConfig: AnthropicExplanationConfig = {
  enabled: true,
  apiKey: "secret-test-key",
  model: "claude-sonnet-4-5",
  timeoutMs: 5_000,
};

function build(
  config: AnthropicExplanationConfig = enabledConfig,
  client: AnthropicMessagesClient | null = {
    createExplanationMessage: vi.fn().mockResolvedValue({
      stopReason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(createExplanationFixture()) }],
    }),
  },
) {
  const anthropic = new AnthropicExplanationGenerator(config, client);
  const template = new TemplateExplanationGenerator();
  return {
    anthropic,
    template,
    generator: new FallbackExplanationGenerator(config, anthropic, template),
    client,
  };
}

describe("FallbackExplanationGenerator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["未設定", undefined],
    ["空文字", ""],
    ["空白", "   "],
  ])("APIキー%s相当の無効設定ではclientを呼ばずTemplateを1回返す", async (_label, _key) => {
    const config: AnthropicExplanationConfig = {
      enabled: false,
      reason: "api_key_missing",
    };
    const client: AnthropicMessagesClient = {
      createExplanationMessage: vi.fn(),
    };
    const { generator, template } = build(config, client);
    const templateSpy = vi.spyOn(template, "generateCounterplanExplanation");
    const input = createCounterplanFixture();
    const result = await generator.generateCounterplanExplanation(input);

    expect(result.summary).toContain("相手ポケモン1体");
    expect(client.createExplanationMessage).not.toHaveBeenCalled();
    expect(templateSpy).toHaveBeenCalledOnce();
    expect(templateSpy).toHaveBeenCalledWith(input);
  });

  it("Anthropic成功時はAnthropic結果を返し、Templateを呼ばない", async () => {
    const { generator, template } = build();
    const templateSpy = vi.spyOn(template, "generateCounterplanExplanation");
    await expect(
      generator.generateCounterplanExplanation(createCounterplanFixture()),
    ).resolves.toEqual(createExplanationFixture());
    expect(templateSpy).not.toHaveBeenCalled();
  });

  it.each([
    "timeout",
    "authentication",
    "rate_limit",
    "server",
    "network",
    "invalid_output",
    "unknown",
  ] satisfies readonly AnthropicFailureCategory[])(
    "%sではTemplateへ1回だけフォールバックする",
    async (category) => {
      const { generator, anthropic, template } = build();
      vi.spyOn(anthropic, "generateCounterplanExplanation").mockRejectedValue(
        new AnthropicGenerationError(category),
      );
      const templateSpy = vi.spyOn(template, "generateCounterplanExplanation");

      const result = await generator.generateCounterplanExplanation(createCounterplanFixture());
      expect(result.summary).toContain("相手ポケモン1体");
      expect(templateSpy).toHaveBeenCalledOnce();
    },
  );

  it("設定不足を安全にログ分類してTemplateへ切り替える", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const config: AnthropicExplanationConfig = {
      enabled: false,
      reason: "model_missing",
    };
    const { generator } = build(config, null);
    await generator.generateCounterplanExplanation(createCounterplanFixture());

    expect(warn).toHaveBeenCalledWith("Anthropic explanation fallback category=configuration");
  });

  it("ログへ秘密・prompt・model出力・notes・ユーザー識別情報を含めない", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { generator, anthropic } = build();
    vi.spyOn(anthropic, "generateCounterplanExplanation").mockRejectedValue(
      new AnthropicGenerationError("authentication"),
    );
    await generator.generateCounterplanExplanation(createCounterplanFixture());

    const logs = JSON.stringify(warn.mock.calls);
    for (const forbidden of [
      "secret-test-key",
      "claude-sonnet",
      "壁から展開する",
      "警戒事項",
      "userId",
      "email",
      "JWT",
    ]) {
      expect(logs).not.toContain(forbidden);
    }
  });

  it("構造化counterplanを変更せず、Template fallbackは決定的", async () => {
    const { generator, anthropic } = build();
    vi.spyOn(anthropic, "generateCounterplanExplanation").mockRejectedValue(
      new AnthropicGenerationError("timeout"),
    );
    const input = createCounterplanFixture();
    const before = structuredClone(input);
    const first = await generator.generateCounterplanExplanation(input);
    const second = await generator.generateCounterplanExplanation(input);
    expect(input).toEqual(before);
    expect(second).toEqual(first);
  });

  it("Template自体の例外は飲み込まない", async () => {
    const config: AnthropicExplanationConfig = {
      enabled: false,
      reason: "api_key_missing",
    };
    const { generator, template } = build(config, null);
    vi.spyOn(template, "generateCounterplanExplanation").mockRejectedValue(
      new RangeError("invalid structured counterplan"),
    );
    await expect(
      generator.generateCounterplanExplanation(createCounterplanFixture()),
    ).rejects.toThrow("invalid structured counterplan");
  });

  it("成功時は処理時間だけを安全にログ出力する", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { generator } = build();
    await generator.generateCounterplanExplanation(createCounterplanFixture());
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^Anthropic explanation generated durationMs=\d+$/u),
    );
  });
});
