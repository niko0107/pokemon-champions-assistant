import { Logger } from "@nestjs/common";
import { createClient } from "redis";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

const REDIS_CONNECT_TIMEOUT_MS = 1_000;
const REDIS_RECONNECT_BASE_DELAY_MS = 250;
const REDIS_RECONNECT_MAX_DELAY_MS = 5_000;
const REDIS_COMMAND_QUEUE_MAX_LENGTH = 1_000;
const logger = new Logger("RedisModule");

export type RedisClient = ReturnType<typeof createClient>;

function reconnectDelay(retries: number): number {
  const exponent = Math.min(Math.max(retries, 0), 5);
  return Math.min(REDIS_RECONNECT_BASE_DELAY_MS * 2 ** exponent, REDIS_RECONNECT_MAX_DELAY_MS);
}

function isValidRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "redis:" || url.protocol === "rediss:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * REDIS_URLが未設定・不正ならRedisを無効化する。
 * URL全体やパスワードはログへ出さない。
 */
export function createRedisClientFromUrl(redisUrl: string | undefined): RedisClient | null {
  const normalized = redisUrl?.trim();
  if (!normalized) {
    return null;
  }
  if (!isValidRedisUrl(normalized)) {
    logger.warn("REDIS_URL is invalid; Redis adapter is disabled");
    return null;
  }

  return createClient({
    url: normalized,
    commandsQueueMaxLength: REDIS_COMMAND_QUEUE_MAX_LENGTH,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: reconnectDelay,
    },
  });
}
