import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AnthropicExplanationConfig } from "./anthropic-explanation.config";
import {
  ANTHROPIC_SYSTEM_PROMPT,
  AnthropicExplanationGenerator,
  projectCounterplanForAnthropic,
} from "./anthropic-explanation-generator";
import { AnthropicGenerationError } from "./anthropic-generation-error";
import { ANTHROPIC_SUMMARY_MAX_LENGTH } from "./anthropic-explanation-output";
import type {
  AnthropicExplanationMessageResponse,
  AnthropicMessagesClient,
} from "./anthropic-messages.client";
import { createCounterplanFixture, createExplanationFixture } from "./explanation-test-fixture";

const enabledConfig: AnthropicExplanationConfig = {
  enabled: true,
  apiKey: "test-key",
  model: "claude-sonnet-4-5",
  timeoutMs: 5_000,
};

function response(
  value: unknown = createExplanationFixture(),
): AnthropicExplanationMessageResponse {
  return {
    stopReason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

function setup(
  implementation: AnthropicMessagesClient["createExplanationMessage"] = () =>
    Promise.resolve(response()),
  config: AnthropicExplanationConfig = enabledConfig,
) {
  const createExplanationMessage =
    vi.fn<AnthropicMessagesClient["createExplanationMessage"]>(implementation);
  const client: AnthropicMessagesClient = { createExplanationMessage };
  return {
    generator: new AnthropicExplanationGenerator(config, client),
    createExplanationMessage,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

async function expectCategory(
  error: unknown,
  expected: AnthropicGenerationError["category"],
): Promise<void> {
  const { generator } = setup(() => Promise.reject(error));
  await expect(
    generator.generateCounterplanExplanation(createCounterplanFixture()),
  ).rejects.toEqual(expect.objectContaining({ category: expected }));
}

describe("AnthropicExplanationGenerator", () => {
  it("正常JSONを既存構造で返し、入力を変更しない", async () => {
    const input = createCounterplanFixture();
    const snapshot = structuredClone(input);
    deepFreeze(input);
    const { generator } = setup();

    await expect(generator.generateCounterplanExplanation(input)).resolves.toEqual(
      createExplanationFixture(),
    );
    expect(input).toEqual(snapshot);
  });

  it("正しいmodel・timeoutと責務制限prompt、必要最小限の構造化入力を渡す", async () => {
    const input = createCounterplanFixture();
    const { generator, createExplanationMessage } = setup();
    await generator.generateCounterplanExplanation(input);

    expect(createExplanationMessage).toHaveBeenCalledOnce();
    const request = createExplanationMessage.mock.calls[0]![0];
    expect(request.model).toBe("claude-sonnet-4-5");
    expect(request.timeoutMs).toBe(5_000);
    for (const instruction of [
      "確定済みデータだけ",
      "おすすめPokemon",
      "選出",
      "先発",
      "スコアや相性を再計算せず",
      "推測しない",
      "外部知識",
      "内容を膨らませない",
      "JSON構造だけ",
      "Markdownコードフェンス",
      "HTML",
    ]) {
      expect(request.system).toContain(instruction);
    }
    expect(request.system).toBe(ANTHROPIC_SYSTEM_PROMPT);

    const projected = projectCounterplanForAnthropic(input);
    expect(request.user).toContain(JSON.stringify(projected));
    expect(projected.perOpponent[0]?.recommendations[0]).toEqual({
      rank: 1,
      selfPokemonId: 1,
      opponentPokemonId: 101,
      totalScore: 44,
      classification: "favorable",
      calculationMode: "full",
      offensiveScore: 25,
      defensiveScore: 20,
      damageRaceScore: 5,
      reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
    });
    expect(request.user).not.toContain("userId");
    expect(request.user).not.toContain("email");
    expect(request.user).not.toContain("JWT");
    expect(request.user).not.toContain("apiKey");
    expect(request.user).not.toContain("timestamp");
    expect(request.user).not.toContain("SQL");
    expect(request.user).not.toContain("stack");
    expect(request.user).not.toContain("observations");
  });

  it("最大6体を入力と同じID・順序で返す", async () => {
    const ids = [101, 102, 103, 104, 105, 106];
    const input = createCounterplanFixture(ids);
    const { generator } = setup(() => Promise.resolve(response(createExplanationFixture(ids))));
    const result = await generator.generateCounterplanExplanation(input);
    expect(result.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId)).toEqual(ids);
  });

  it("複数text blockを順番どおり結合する", async () => {
    const text = JSON.stringify(createExplanationFixture());
    const middle = Math.floor(text.length / 2);
    const { generator } = setup(() =>
      Promise.resolve({
        stopReason: "end_turn",
        content: [
          { type: "text", text: text.slice(0, middle) },
          { type: "text", text: text.slice(middle) },
        ],
      }),
    );
    await expect(
      generator.generateCounterplanExplanation(createCounterplanFixture()),
    ).resolves.toEqual(createExplanationFixture());
  });

  it.each([
    ["空content", { stopReason: "end_turn", content: [] }],
    ["textなし", { stopReason: "end_turn", content: [{ type: "thinking" }] }],
    [
      "textと非text混在",
      { stopReason: "end_turn", content: [{ type: "text", text: "{}" }, { type: "tool_use" }] },
    ],
    ["空text", { stopReason: "end_turn", content: [{ type: "text", text: "   " }] }],
    ["不正JSON", { stopReason: "end_turn", content: [{ type: "text", text: "not-json" }] }],
    [
      "コードフェンス",
      { stopReason: "end_turn", content: [{ type: "text", text: "```json\n{}\n```" }] },
    ],
    [
      "異常終了",
      {
        stopReason: "max_tokens",
        content: [{ type: "text", text: JSON.stringify(createExplanationFixture()) }],
      },
    ],
    [
      "refusal",
      {
        stopReason: "refusal",
        content: [{ type: "text", text: JSON.stringify(createExplanationFixture()) }],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, AnthropicExplanationMessageResponse]>)(
    "%sをinvalid_outputとして拒否する",
    async (_label, invalidResponse) => {
      const { generator } = setup(() => Promise.resolve(invalidResponse));
      await expect(
        generator.generateCounterplanExplanation(createCounterplanFixture()),
      ).rejects.toEqual(expect.objectContaining({ category: "invalid_output" }));
    },
  );

  it.each([
    [
      "必須不足",
      (() => {
        const { summary: _summary, ...value } = createExplanationFixture();
        return value;
      })(),
    ],
    ["余分なキー", { ...createExplanationFixture(), provider: "anthropic" }],
    ["空文字", { ...createExplanationFixture(), summary: "" }],
    ["空白", { ...createExplanationFixture(), summary: "   " }],
    [
      "長さ超過",
      { ...createExplanationFixture(), summary: "長".repeat(ANTHROPIC_SUMMARY_MAX_LENGTH + 1) },
    ],
    ["HTML", { ...createExplanationFixture(), summary: "<strong>対策</strong>" }],
    ["未知ID", createExplanationFixture([999])],
    ["相手不足", { ...createExplanationFixture(), perOpponent: [] }],
    ["相手重複", createExplanationFixture([101, 101])],
  ] as const)("%s出力を部分採用せず拒否する", async (_label, invalidOutput) => {
    const { generator } = setup(() => Promise.resolve(response(invalidOutput)));
    await expect(
      generator.generateCounterplanExplanation(createCounterplanFixture()),
    ).rejects.toEqual(expect.objectContaining({ category: "invalid_output" }));
  });

  it("設定無効またはclientなしをconfigurationとして拒否し、APIを呼ばない", async () => {
    const disabled: AnthropicExplanationConfig = {
      enabled: false,
      reason: "api_key_missing",
    };
    const createExplanationMessage = vi.fn();
    const disabledGenerator = new AnthropicExplanationGenerator(disabled, {
      createExplanationMessage,
    });
    const clientlessGenerator = new AnthropicExplanationGenerator(enabledConfig, null);

    await expect(
      disabledGenerator.generateCounterplanExplanation(createCounterplanFixture()),
    ).rejects.toEqual(expect.objectContaining({ category: "configuration" }));
    await expect(
      clientlessGenerator.generateCounterplanExplanation(createCounterplanFixture()),
    ).rejects.toEqual(expect.objectContaining({ category: "configuration" }));
    expect(createExplanationMessage).not.toHaveBeenCalled();
  });

  it("SDK timeoutを分類する", () =>
    expectCategory(new Anthropic.APIConnectionTimeoutError(), "timeout"));
  it("SDK network errorを分類する", () =>
    expectCategory(new Anthropic.APIConnectionError({ message: "network" }), "network"));

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [429, "rate_limit"],
    [500, "server"],
  ] as const)("SDK HTTP %iを%sへ分類する", async (status, category) => {
    const error = Anthropic.APIError.generate(
      status,
      { type: "error", error: { type: "api_error", message: "safe test" } },
      "safe test",
      new Headers(),
    );
    await expectCategory(error, category);
  });

  it("想定外例外をunknownへ分類する", () => expectCategory(new Error("unexpected"), "unknown"));
});
