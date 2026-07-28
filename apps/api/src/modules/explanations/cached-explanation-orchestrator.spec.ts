import type { CounterplanExplanation } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCounterplanFixture, createExplanationFixture } from "./explanation-test-fixture";
import { CachedExplanationOrchestrator } from "./cached-explanation-orchestrator";
import type { LlmExplanationCache } from "./llm-explanation-cache";
import type { ExplanationEnqueueResult, ExplanationQueue } from "./llm-explanation-queue";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

describe("CachedExplanationOrchestrator", () => {
  const input = createCounterplanFixture();
  const cachedExplanation = createExplanationFixture();
  const read = vi.fn();
  const readFailure = vi.fn();
  const enqueue = vi.fn<ExplanationQueue["enqueue"]>();
  let queueAvailable = true;
  let orchestrator: CachedExplanationOrchestrator;

  beforeEach(() => {
    read.mockReset();
    readFailure.mockReset();
    enqueue.mockReset();
    queueAvailable = true;
    const cache = { read, readFailure } as unknown as LlmExplanationCache;
    const queue: ExplanationQueue = {
      isAvailable: () => queueAvailable,
      enqueue,
    };
    orchestrator = new CachedExplanationOrchestrator(
      {
        enabled: true,
        apiKey: "not-exposed",
        model: "claude-sonnet-4-5-20250929",
        timeoutMs: 1_000,
      },
      { enabled: true, ttlSeconds: 86_400 },
      cache,
      queue,
      new TemplateExplanationGenerator(),
    );
  });

  it("cache hitではAnthropic説明を返しjobを登録しない", async () => {
    read.mockResolvedValue({ status: "hit", explanation: cachedExplanation });
    await expect(orchestrator.generateCounterplanExplanation(input)).resolves.toEqual(
      cachedExplanation,
    );
    expect(readFailure).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("cache missではTemplateを即時生成して重複なしQueue登録だけを行う", async () => {
    read.mockResolvedValue({ status: "miss" });
    readFailure.mockResolvedValue({ status: "miss" });
    enqueue.mockResolvedValue("enqueued");

    const result = await orchestrator.generateCounterplanExplanation(input);

    expect(result.summary).toContain("相手ポケモン1体");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        jobId: expect.stringMatching(/^llm-explanation-[a-f0-9]{64}$/u),
      }),
    );
  });

  it.each([
    ["Redis unavailable", { status: "unavailable" } as const, true],
    ["Queue unavailable", { status: "miss" } as const, false],
  ])("%sでもTemplate応答を維持する", async (_label, cacheResult, queueState) => {
    read.mockResolvedValue(cacheResult);
    queueAvailable = queueState;
    const result = await orchestrator.generateCounterplanExplanation(input);
    expect(result.summary).toContain("相手ポケモン1体");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("failure cooldown中はTemplateを返して再登録しない", async () => {
    read.mockResolvedValue({ status: "miss" });
    readFailure.mockResolvedValue({ status: "hit" });
    const result = await orchestrator.generateCounterplanExplanation(input);
    expect(result.summary).toContain("相手ポケモン1体");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    [
      { enabled: false, reason: "api_key_missing" } as const,
      { enabled: true, ttlSeconds: 86_400 } as const,
    ],
    [
      {
        enabled: true,
        apiKey: "key",
        model: "claude-sonnet-4-5-20250929",
        timeoutMs: 1_000,
      } as const,
      { enabled: false, reason: "invalid_ttl" } as const,
    ],
  ])("設定不足・TTL不正ではcache/Queueを使わずTemplateを返す", async (anthropic, cacheConfig) => {
    const disabled = new CachedExplanationOrchestrator(
      anthropic,
      cacheConfig,
      { read, readFailure } as unknown as LlmExplanationCache,
      { isAvailable: () => true, enqueue } satisfies ExplanationQueue,
      new TemplateExplanationGenerator(),
    );
    const result = await disabled.generateCounterplanExplanation(input);
    expect(result.summary).toContain("相手ポケモン1体");
    expect(read).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    await expect(disabled.getCounterplanExplanationStatus(input)).resolves.toEqual({
      status: "unavailable",
      explanation: null,
    });
  });

  it.each([
    ["ready", { status: "hit", explanation: cachedExplanation }, "ready"],
    ["failed", { status: "miss" }, "failed"],
    ["pending", { status: "miss" }, "pending"],
  ])("状態APIで%sを返す", async (label, cacheResult, expectedStatus) => {
    read.mockResolvedValue(cacheResult);
    readFailure.mockResolvedValue({ status: label === "failed" ? "hit" : "miss" });
    enqueue.mockResolvedValue("enqueued");

    const result = await orchestrator.getCounterplanExplanationStatus(input);

    expect(result.status).toBe(expectedStatus);
    if (expectedStatus === "ready") {
      expect(result.explanation).toEqual(cachedExplanation);
      expect(enqueue).not.toHaveBeenCalled();
    } else if (expectedStatus === "failed") {
      expect(enqueue).not.toHaveBeenCalled();
    } else {
      expect(enqueue).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["cache", { status: "unavailable" } as const, true, "enqueued" as ExplanationEnqueueResult],
    ["queue state", { status: "miss" } as const, false, "enqueued" as ExplanationEnqueueResult],
    ["queue add", { status: "miss" } as const, true, "unavailable" as ExplanationEnqueueResult],
  ])("%s障害では状態APIがunavailable", async (_label, cacheResult, available, enqueueResult) => {
    read.mockResolvedValue(cacheResult);
    readFailure.mockResolvedValue({ status: "miss" });
    queueAvailable = available;
    enqueue.mockResolvedValue(enqueueResult);
    await expect(orchestrator.getCounterplanExplanationStatus(input)).resolves.toEqual({
      status: "unavailable",
      explanation: null,
    });
  });

  it("Template生成や入力を変更しない", async () => {
    read.mockResolvedValue({ status: "miss" });
    readFailure.mockResolvedValue({ status: "miss" });
    enqueue.mockResolvedValue("deduplicated");
    const before = structuredClone(input);
    const result: CounterplanExplanation = await orchestrator.generateCounterplanExplanation(input);
    expect(result).toBeDefined();
    expect(input).toEqual(before);
  });
});
