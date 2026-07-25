import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { RedisAdapter, RedisOperationResult } from "./redis-adapter";
import { REDIS_CLIENT, type RedisClient } from "./redis-client.provider";

const REDIS_INITIALIZATION_WAIT_MS = 1_250;
const REDIS_COMMAND_TIMEOUT_MS = 1_000;
const REDIS_UNAVAILABLE = { status: "unavailable" } as const;

class RedisCommandTimeoutError extends Error {
  constructor() {
    super("Redis command timed out");
    this.name = "RedisCommandTimeoutError";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

@Injectable()
export class RedisService implements RedisAdapter, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private available = false;
  private warningEmitted = false;

  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient | null) {
    if (client) {
      client.on("ready", () => {
        this.available = true;
        this.warningEmitted = false;
      });
      client.on("reconnecting", () => {
        this.available = false;
        this.warnUnavailable();
      });
      client.on("end", () => {
        this.available = false;
      });
      // node-redisはerror listenerがないとEventEmitter経由でプロセスを終了させる。
      client.on("error", () => {
        this.available = false;
        this.warnUnavailable();
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }

    const connection = this.client
      .connect()
      .then(() => {
        this.available = this.client?.isReady === true;
      })
      .catch(() => {
        this.available = false;
        this.warnUnavailable();
      });

    await Promise.race([connection, delay(REDIS_INITIALIZATION_WAIT_MS)]);
    if (!this.client.isReady) {
      this.warnUnavailable();
    }
  }

  onModuleDestroy(): void {
    this.available = false;
    if (this.client?.isOpen) {
      this.client.destroy();
    }
  }

  isAvailable(): boolean {
    return this.available && this.client?.isReady === true;
  }

  async ping(): Promise<RedisOperationResult<"PONG">> {
    return this.execute(async () => {
      const response = await this.client!.ping();
      if (response !== "PONG") {
        throw new Error("Unexpected Redis ping response");
      }
      return "PONG" as const;
    });
  }

  async get(key: string): Promise<RedisOperationResult<string | null>> {
    return this.execute(() => this.client!.get(key));
  }

  async set(key: string, value: string): Promise<RedisOperationResult<void>> {
    return this.execute(async () => {
      await this.client!.set(key, value);
    });
  }

  async setWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<RedisOperationResult<void>> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError("ttlSeconds must be a positive safe integer");
    }

    return this.execute(async () => {
      await this.client!.set(key, value, {
        expiration: { type: "EX", value: ttlSeconds },
      });
    });
  }

  async delete(key: string): Promise<RedisOperationResult<number>> {
    return this.execute(() => this.client!.del(key));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<RedisOperationResult<T>> {
    if (!this.client?.isReady) {
      this.available = false;
      return REDIS_UNAVAILABLE;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new RedisCommandTimeoutError()),
          REDIS_COMMAND_TIMEOUT_MS,
        );
      });
      const value = await Promise.race([operation(), timeoutPromise]);
      this.available = true;
      this.warningEmitted = false;
      return { status: "ok", value };
    } catch {
      this.available = false;
      this.warnUnavailable();
      return REDIS_UNAVAILABLE;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private warnUnavailable(): void {
    if (this.warningEmitted) {
      return;
    }
    this.warningEmitted = true;
    this.logger.warn("Redis is unavailable; Redis-dependent features must use their fallback");
  }
}
