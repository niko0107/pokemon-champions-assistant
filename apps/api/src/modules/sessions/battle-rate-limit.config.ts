export const DEFAULT_BATTLE_RATE_LIMIT = 60;
export const DEFAULT_BATTLE_RATE_LIMIT_WINDOW_SECONDS = 60;

export interface BattleRateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export const BATTLE_RATE_LIMIT_CONFIG = Symbol("BATTLE_RATE_LIMIT_CONFIG");

function resolvePositiveSafeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveBattleRateLimitConfig(
  limit: string | undefined,
  windowSeconds: string | undefined,
): BattleRateLimitConfig {
  return {
    limit: resolvePositiveSafeInteger(limit, DEFAULT_BATTLE_RATE_LIMIT),
    windowSeconds: resolvePositiveSafeInteger(
      windowSeconds,
      DEFAULT_BATTLE_RATE_LIMIT_WINDOW_SECONDS,
    ),
  };
}
