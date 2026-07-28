import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_OPPONENT_EXPLANATION_MAX_LENGTH,
  ANTHROPIC_SELECTION_EXPLANATION_MAX_LENGTH,
  ANTHROPIC_STRATEGY_EXPLANATION_MAX_LENGTH,
  ANTHROPIC_SUMMARY_MAX_LENGTH,
  parseAnthropicCounterplanExplanation,
} from "./anthropic-explanation-output";
import { createExplanationFixture } from "./explanation-test-fixture";

describe("Anthropic counterplan explanation output", () => {
  it("strictな正常出力と全相手IDを受理する", () => {
    const value = createExplanationFixture([101, 102]);
    expect(parseAnthropicCounterplanExplanation(value, [101, 102])).toEqual(value);
  });

  it.each([
    ["summary", ANTHROPIC_SUMMARY_MAX_LENGTH],
    ["selectionExplanation", ANTHROPIC_SELECTION_EXPLANATION_MAX_LENGTH],
    ["strategyExplanation", ANTHROPIC_STRATEGY_EXPLANATION_MAX_LENGTH],
  ] as const)("%sの長さ上限を超えたら拒否する", (field, maximum) => {
    const value = createExplanationFixture();
    value[field] = "長".repeat(maximum + 1);
    expect(() => parseAnthropicCounterplanExplanation(value, [101])).toThrow();
  });

  it("相手別説明の長さ上限を超えたら拒否する", () => {
    const value = createExplanationFixture();
    value.perOpponent[0]!.explanation = "長".repeat(ANTHROPIC_OPPONENT_EXPLANATION_MAX_LENGTH + 1);
    expect(() => parseAnthropicCounterplanExplanation(value, [101])).toThrow();
  });

  it.each(["summary", "selectionExplanation", "strategyExplanation"] as const)(
    "%sの空文字・空白だけを拒否する",
    (field) => {
      for (const text of ["", "   "]) {
        const value = createExplanationFixture();
        value[field] = text;
        expect(() => parseAnthropicCounterplanExplanation(value, [101])).toThrow();
      }
    },
  );

  it("相手別説明の空白だけを拒否する", () => {
    const value = createExplanationFixture();
    value.perOpponent[0]!.explanation = "   ";
    expect(() => parseAnthropicCounterplanExplanation(value, [101])).toThrow();
  });

  it.each([
    "<script>alert(1)</script>",
    "<strong>対策</strong>",
    "<!-- comment -->",
    "<!DOCTYPE html>",
  ])("HTML %sを拒否する", (html) => {
    const value = createExplanationFixture();
    value.summary = html;
    expect(() => parseAnthropicCounterplanExplanation(value, [101])).toThrow();
  });

  it("余分なキー・必須不足を拒否する", () => {
    expect(() =>
      parseAnthropicCounterplanExplanation(
        { ...createExplanationFixture(), provider: "anthropic" },
        [101],
      ),
    ).toThrow();
    const { summary: _summary, ...missing } = createExplanationFixture();
    expect(() => parseAnthropicCounterplanExplanation(missing, [101])).toThrow();
  });

  it("未知・不足・順序違い・重複の相手IDを拒否する", () => {
    expect(() =>
      parseAnthropicCounterplanExplanation(createExplanationFixture([999]), [101]),
    ).toThrow();
    expect(() =>
      parseAnthropicCounterplanExplanation(createExplanationFixture([101]), [101, 102]),
    ).toThrow();
    expect(() =>
      parseAnthropicCounterplanExplanation(createExplanationFixture([102, 101]), [101, 102]),
    ).toThrow();
    expect(() =>
      parseAnthropicCounterplanExplanation(createExplanationFixture([101, 101]), [101, 101]),
    ).toThrow();
  });
});
