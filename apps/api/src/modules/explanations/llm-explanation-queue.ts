import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { CounterplanResult } from "@pokemon-champions/matchup";
import { Job, Queue, Worker, type ConnectionOptions } from "bullmq";
import { ANTHROPIC_CONFIG, type AnthropicExplanationConfig } from "./anthropic-explanation.config";
import { AnthropicExplanationGenerator } from "./anthropic-explanation-generator";
import { AnthropicGenerationError } from "./anthropic-generation-error";
import { LlmExplanationCache } from "./llm-explanation-cache";
import { LLM_EXPLANATION_JOB_NAME, LLM_EXPLANATION_QUEUE_NAME } from "./llm-explanation.constants";
import {
  LLM_EXPLANATION_CACHE_CONFIG,
  type LlmExplanationCacheConfig,
} from "./llm-explanation.config";
import {
  buildLlmExplanationCacheKey,
  type LlmExplanationCacheKey,
} from "./llm-explanation-cache-key";
import {
  llmExplanationJobPayloadSchema,
  parseLlmExplanationJobPayload,
  type LlmExplanationJobPayload,
} from "./llm-explanation-input";

export const LLM_EXPLANATION_QUEUE = Symbol("LLM_EXPLANATION_QUEUE");
export const LLM_EXPLANATION_JOB_ATTEMPTS = 1;
export const LLM_EXPLANATION_JOB_REMOVE_ON_COMPLETE = true;
export const LLM_EXPLANATION_JOB_REMOVE_ON_FAIL = true;

export type ExplanationEnqueueResult = "enqueued" | "deduplicated" | "unavailable";

export interface ExplanationQueue {
  isAvailable(): boolean;
  enqueue(input: CounterplanResult, key: LlmExplanationCacheKey): Promise<ExplanationEnqueueResult>;
}

const QUEUE_INITIALIZATION_WAIT_MS = 1_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function reconnectDelay(retries: number): number {
  return Math.min(250 * 2 ** Math.min(Math.max(retries, 0), 5), 5_000);
}

export function resolveBullMqConnection(redisUrl: string | undefined): {
  readonly producer: ConnectionOptions;
  readonly worker: ConnectionOptions;
} | null {
  const normalized = redisUrl?.trim();
  if (!normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") ||
      parsed.hostname.length === 0
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    producer: {
      url: normalized,
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: reconnectDelay,
    },
    worker: {
      url: normalized,
      connectTimeout: 1_000,
      maxRetriesPerRequest: null,
      retryStrategy: reconnectDelay,
    },
  };
}

function generationLogCategory(error: unknown): string {
  if (!(error instanceof AnthropicGenerationError)) {
    return "generation_failed";
  }
  if (error.category === "timeout") {
    return "generation_timeout";
  }
  if (error.category === "rate_limit") {
    return "generation_rate_limit";
  }
  if (error.category === "invalid_output") {
    return "generation_invalid_output";
  }
  return "generation_failed";
}

@Injectable()
export class BullMqExplanationQueue implements ExplanationQueue, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqExplanationQueue.name);
  private queue: Queue<LlmExplanationJobPayload> | null = null;
  private worker: Worker<LlmExplanationJobPayload> | null = null;
  private queueReady = false;
  private workerReady = false;
  private shuttingDown = false;

  constructor(
    @Inject(ANTHROPIC_CONFIG)
    private readonly anthropicConfig: AnthropicExplanationConfig,
    @Inject(LLM_EXPLANATION_CACHE_CONFIG)
    private readonly cacheConfig: LlmExplanationCacheConfig,
    private readonly anthropic: AnthropicExplanationGenerator,
    private readonly cache: LlmExplanationCache,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = resolveBullMqConnection(process.env.REDIS_URL);
    if (!this.anthropicConfig.enabled || !this.cacheConfig.enabled || connection === null) {
      return;
    }

    try {
      this.queue = new Queue<LlmExplanationJobPayload>(LLM_EXPLANATION_QUEUE_NAME, {
        connection: connection.producer,
        defaultJobOptions: {
          attempts: LLM_EXPLANATION_JOB_ATTEMPTS,
          removeOnComplete: LLM_EXPLANATION_JOB_REMOVE_ON_COMPLETE,
          removeOnFail: LLM_EXPLANATION_JOB_REMOVE_ON_FAIL,
        },
      });
      this.worker = new Worker<LlmExplanationJobPayload>(
        LLM_EXPLANATION_QUEUE_NAME,
        (job) => this.process(job),
        {
          connection: connection.worker,
          concurrency: 1,
        },
      );
      this.queue.on("error", () => {
        this.queueReady = false;
        this.logger.warn("queue_unavailable");
      });
      this.worker.on("error", () => {
        this.workerReady = false;
        this.logger.warn("queue_unavailable");
      });
      this.worker.on("ready", () => {
        this.workerReady = true;
        void this.queue
          ?.waitUntilReady()
          .then(() => {
            this.queueReady = true;
          })
          .catch(() => {
            this.queueReady = false;
          });
      });

      const readiness = Promise.all([
        this.queue.waitUntilReady().then(() => {
          this.queueReady = true;
        }),
        this.worker.waitUntilReady().then(() => {
          this.workerReady = true;
        }),
      ]).catch(() => {
        this.queueReady = false;
        this.workerReady = false;
        this.logger.warn("queue_unavailable");
      });
      await Promise.race([readiness, delay(QUEUE_INITIALIZATION_WAIT_MS)]);
    } catch {
      this.queueReady = false;
      this.workerReady = false;
      this.logger.warn("queue_unavailable");
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.queueReady = false;
    this.workerReady = false;
    try {
      await this.worker?.close();
    } catch {
      this.logger.warn("queue_unavailable");
    }
    try {
      await this.queue?.close();
    } catch {
      this.logger.warn("queue_unavailable");
    }
  }

  isAvailable(): boolean {
    return (
      !this.shuttingDown &&
      this.anthropicConfig.enabled &&
      this.cacheConfig.enabled &&
      this.queue !== null &&
      this.worker !== null &&
      this.queueReady &&
      this.workerReady
    );
  }

  async enqueue(
    input: CounterplanResult,
    key: LlmExplanationCacheKey,
  ): Promise<ExplanationEnqueueResult> {
    if (!this.isAvailable() || this.queue === null) {
      return "unavailable";
    }

    try {
      const existing = await this.queue.getJob(key.jobId);
      if (existing !== undefined) {
        this.logger.log("enqueue_deduplicated");
        return "deduplicated";
      }

      const payload = llmExplanationJobPayloadSchema.parse({ input }) as LlmExplanationJobPayload;
      await this.queue.add(LLM_EXPLANATION_JOB_NAME, payload, {
        jobId: key.jobId,
        attempts: LLM_EXPLANATION_JOB_ATTEMPTS,
        removeOnComplete: LLM_EXPLANATION_JOB_REMOVE_ON_COMPLETE,
        removeOnFail: LLM_EXPLANATION_JOB_REMOVE_ON_FAIL,
      });
      this.logger.log("enqueue_success");
      return "enqueued";
    } catch {
      this.logger.warn("queue_unavailable");
      return "unavailable";
    }
  }

  private async process(job: Job<LlmExplanationJobPayload>): Promise<void> {
    let key: LlmExplanationCacheKey | null = null;
    try {
      if (!this.anthropicConfig.enabled) {
        throw new AnthropicGenerationError("configuration");
      }
      const payload = parseLlmExplanationJobPayload(job.data);
      key = buildLlmExplanationCacheKey(payload.input, this.anthropicConfig.model);
      if (job.id !== key.jobId) {
        throw new AnthropicGenerationError("invalid_output");
      }

      const explanation = await this.anthropic.generateCounterplanExplanation(payload.input);
      const stored = await this.cache.write(
        key.cacheKey,
        explanation,
        payload.input.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId),
      );
      if (!stored) {
        throw new Error("Cache unavailable");
      }
      this.logger.log("generation_success");
    } catch (error: unknown) {
      this.logger.warn(generationLogCategory(error));
      if (key !== null) {
        await this.cache.markFailure(key.failureKey);
      }
      throw new Error("LLM explanation generation failed");
    }
  }
}
