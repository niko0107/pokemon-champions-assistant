import type { CounterplanResult } from "@pokemon-champions/matchup";
import { describe, expect, it } from "vitest";
import { createCounterplanFixture } from "./explanation-test-fixture";
import { buildLlmExplanationCacheKey, canonicalJson } from "./llm-explanation-cache-key";

const model = "claude-sonnet-4-5-20250929";
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};
type MutableCounterplan = Mutable<CounterplanResult>;

describe("buildLlmExplanationCacheKey", () => {
  it("同一入力から同一のnamespace・SHA-256・jobIdを返し入力を変更しない", () => {
    const input = createCounterplanFixture([101, 102]);
    const before = structuredClone(input);
    const first = buildLlmExplanationCacheKey(input, model);
    const second = buildLlmExplanationCacheKey(input, model);

    expect(first).toEqual(second);
    expect(first.cacheKey).toMatch(/^pca:llm-explanation:v1:[a-f0-9]{64}$/u);
    expect(first.failureKey).toMatch(/^pca:llm-explanation-failure:v1:[a-f0-9]{64}$/u);
    expect(first.jobId).toBe(`llm-explanation-${first.hash}`);
    expect(input).toEqual(before);
  });

  it("canonical JSONはオブジェクト生成順に依存せず配列順を維持する", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(canonicalJson({ values: [1, 2] })).not.toBe(canonicalJson({ values: [2, 1] }));
  });

  it.each([
    [
      "score",
      (input: MutableCounterplan) => {
        input.perOpponent[0]!.recommendations[0]!.totalScore++;
      },
    ],
    [
      "recommendation",
      (input: MutableCounterplan) => {
        input.perOpponent[0]!.recommendations[0]!.selfPokemonId = 5;
      },
    ],
    [
      "selection",
      (input: MutableCounterplan) => {
        input.selection.selectedPokemonIds[0] = 5;
      },
    ],
    [
      "reasonCodes",
      (input: MutableCounterplan) => {
        input.perOpponent[0]!.recommendations[0]!.reasonCodes = ["EVEN_DAMAGE_RACE"];
      },
    ],
    [
      "strategyCodes",
      (input: MutableCounterplan) => {
        input.strategyCodes = ["LIMIT_HAZARDS"];
      },
    ],
    [
      "cautionMoves",
      (input: MutableCounterplan) => {
        input.cautionMoves[0]!.moveId++;
      },
    ],
    [
      "threatNotes",
      (input: MutableCounterplan) => {
        input.threatNotes[0]!.note = "変更";
      },
    ],
    [
      "playstyleNotes",
      (input: MutableCounterplan) => {
        input.playstyleNotes = "変更";
      },
    ],
  ])("%s変更で別キーになる", (_label, mutate) => {
    const original = createCounterplanFixture();
    const changed = structuredClone(original) as MutableCounterplan;
    mutate(changed);
    expect(buildLlmExplanationCacheKey(changed, model).hash).not.toBe(
      buildLlmExplanationCacheKey(original, model).hash,
    );
  });

  it("model・prompt・schema・generator version変更で別キーになる", () => {
    const input = createCounterplanFixture() as MutableCounterplan;
    const base = buildLlmExplanationCacheKey(input, model);
    expect(buildLlmExplanationCacheKey(input, `${model}-other`).hash).not.toBe(base.hash);
    for (const versions of [
      { promptVersion: 2 },
      { outputSchemaVersion: 2 },
      { generatorVersion: 2 },
      { cacheNamespaceVersion: 2 },
    ]) {
      expect(buildLlmExplanationCacheKey(input, model, versions).hash).not.toBe(base.hash);
    }
  });

  it("keyへ生データ・userId・modelを含めない", () => {
    const input = createCounterplanFixture() as MutableCounterplan;
    input.playstyleNotes = "秘密ではないがkeyへ露出しない原文";
    const key = buildLlmExplanationCacheKey(input, model);
    const serialized = JSON.stringify(key);
    expect(serialized).not.toContain(input.playstyleNotes);
    expect(serialized).not.toContain(model);
    expect(serialized).not.toContain("userId");
  });
});
