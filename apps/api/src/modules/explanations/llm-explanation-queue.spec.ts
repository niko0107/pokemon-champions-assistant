import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCounterplanFixture, createExplanationFixture } from "./explanation-test-fixture";
import type { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import type { LlmExplanationCache } from "./llm-explanation-cache";
import { buildLlmExplanationCacheKey } from "./llm-explanation-cache-key";
import {
  BullMqExplanationQueue,
  LLM_EXPLANATION_JOB_ATTEMPTS,
  LLM_EXPLANATION_JOB_REMOVE_ON_COMPLETE,
  LLM_EXPLANATION_JOB_REMOVE_ON_FAIL,
  resolveBullMqConnection,
} from "./llm-explanation-queue";
import { LLM_EXPLANATION_QUEUE_NAME } from "./llm-explanation.constants";

const model = "claude-sonnet-4-5-20250929";

interface QueueInternals {
  queue: {
    getJob: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } | null;
  worker: { close: ReturnType<typeof vi.fn> } | null;
  queueReady: boolean;
  workerReady: boolean;
  process(job: { id: string; data: unknown }): Promise<void>;
}

describe("BullMqExplanationQueue", () => {
  const generate = vi.fn();
  const write = vi.fn();
  const markFailure = vi.fn();
  let service: BullMqExplanationQueue;
  let internals: QueueInternals;

  beforeEach(() => {
    generate.mockReset();
    write.mockReset();
    markFailure.mockReset();
    service = new BullMqExplanationQueue(
      {
        enabled: true,
        apiKey: "not-in-job",
        model,
        timeoutMs: 1_000,
      },
      { enabled: true, ttlSeconds: 86_400 },
      { generateCounterplanExplanation: generate } as unknown as AnthropicExplanationGenerator,
      { write, markFailure } as unknown as LlmExplanationCache,
    );
    internals = service as unknown as QueueInternals;
  });

  it("Queue名・job optionを承認済み値へ固定する", () => {
    expect(LLM_EXPLANATION_QUEUE_NAME).toBe("llm-explanations");
    expect(LLM_EXPLANATION_JOB_ATTEMPTS).toBe(1);
    expect(LLM_EXPLANATION_JOB_REMOVE_ON_COMPLETE).toBe(true);
    expect(LLM_EXPLANATION_JOB_REMOVE_ON_FAIL).toBe(true);
  });

  it.each([undefined, "", " ", "http://localhost:6379", "redis://"])(
    "REDIS_URL=%sではBullMQ connectionを作らない",
    (value) => {
      expect(resolveBullMqConnection(value)).toBeNull();
    },
  );

  it.each(["redis://localhost:6379", "rediss://user:secret@example.com:6380/1"])(
    "有効な%sをproducer/worker接続へ共有する",
    (url) => {
      const result = resolveBullMqConnection(url);
      expect(result?.producer).toMatchObject({ url, maxRetriesPerRequest: 1 });
      expect(result?.worker).toMatchObject({ url, maxRetriesPerRequest: null });
    },
  );

  it("同一jobIdのwaiting/active相当jobを重複登録しない", async () => {
    internals.queue = {
      getJob: vi.fn().mockResolvedValue({ id: "existing" }),
      add: vi.fn(),
      close: vi.fn(),
    };
    internals.worker = { close: vi.fn() };
    internals.queueReady = true;
    internals.workerReady = true;
    const input = createCounterplanFixture();
    const key = buildLlmExplanationCacheKey(input, model);

    await expect(service.enqueue(input, key)).resolves.toBe("deduplicated");
    expect(internals.queue.add).not.toHaveBeenCalled();
  });

  it("最小payloadと決定的jobIdでattempts=1のjobを登録する", async () => {
    internals.queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({}),
      close: vi.fn(),
    };
    internals.worker = { close: vi.fn() };
    internals.queueReady = true;
    internals.workerReady = true;
    const input = createCounterplanFixture();
    const key = buildLlmExplanationCacheKey(input, model);

    await expect(service.enqueue(input, key)).resolves.toBe("enqueued");
    expect(internals.queue.add).toHaveBeenCalledWith(
      "generate-explanation",
      { input },
      {
        jobId: key.jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    const payload = internals.queue.add.mock.calls[0]![1];
    expect(JSON.stringify(payload)).not.toContain("userId");
    expect(JSON.stringify(payload)).not.toContain("apiKey");
    expect(JSON.stringify(payload)).not.toContain("prompt");
  });

  it("Worker成功時だけAnthropic出力をTTL cacheへ保存する", async () => {
    const input = createCounterplanFixture();
    const key = buildLlmExplanationCacheKey(input, model);
    const explanation = createExplanationFixture();
    generate.mockResolvedValue(explanation);
    write.mockResolvedValue(true);

    await expect(internals.process({ id: key.jobId, data: { input } })).resolves.toBeUndefined();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(key.cacheKey, explanation, [101]);
    expect(markFailure).not.toHaveBeenCalled();
  });

  it.each([
    ["timeout", () => new Anthropic.APIConnectionTimeoutError()],
    [
      "429",
      () =>
        Anthropic.APIError.generate(
          429,
          { type: "error", error: { type: "rate_limit_error", message: "limited" } },
          "limited",
          new Headers(),
        ),
    ],
    ["network", () => new Anthropic.APIConnectionError({ message: "network" })],
    ["invalid output", () => new Error("invalid")],
  ])("%s失敗ではcacheせずfailure markerだけを試行する", async (_label, error) => {
    const input = createCounterplanFixture();
    const key = buildLlmExplanationCacheKey(input, model);
    generate.mockRejectedValue(error());
    markFailure.mockResolvedValue(true);

    await expect(internals.process({ id: key.jobId, data: { input } })).rejects.toThrow(
      "LLM explanation generation failed",
    );
    expect(write).not.toHaveBeenCalled();
    expect(markFailure).toHaveBeenCalledWith(key.failureKey);
  });

  it("不正payload・不一致jobIdを拒否して秘密情報を保存しない", async () => {
    await expect(
      internals.process({ id: "llm-explanation-invalid", data: { input: {} } }),
    ).rejects.toThrow("LLM explanation generation failed");
    expect(generate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(markFailure).not.toHaveBeenCalled();
  });

  it("shutdown時はWorkerを先にgraceful closeしてQueueを閉じる", async () => {
    const order: string[] = [];
    internals.worker = {
      close: vi.fn(async () => {
        order.push("worker");
      }),
    };
    internals.queue = {
      getJob: vi.fn(),
      add: vi.fn(),
      close: vi.fn(async () => {
        order.push("queue");
      }),
    };
    await service.onModuleDestroy();
    expect(order).toEqual(["worker", "queue"]);
    expect(service.isAvailable()).toBe(false);
  });
});
