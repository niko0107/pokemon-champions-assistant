export const DEFAULT_BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS = 90 * 24 * 60 * 60;
export const DEFAULT_BATTLE_ENDED_ARCHIVE_AFTER_SECONDS = 90 * 24 * 60 * 60;
export const DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS = 60 * 60;

export interface BattleSessionArchiveConfig {
  activeArchiveAfterSeconds: number;
  endedArchiveAfterSeconds: number;
  intervalSeconds: number;
}

export const BATTLE_SESSION_ARCHIVE_CONFIG = Symbol("BATTLE_SESSION_ARCHIVE_CONFIG");

const MAX_TIMEOUT_SECONDS = Math.floor(2_147_483_647 / 1_000);
const MAX_DATE_OFFSET_SECONDS = 8_000_000_000_000;

function resolvePositiveSafeInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function resolveBattleSessionArchiveConfig(
  activeArchiveAfterSeconds: string | undefined,
  endedArchiveAfterSeconds: string | undefined,
  intervalSeconds: string | undefined,
): BattleSessionArchiveConfig {
  return {
    activeArchiveAfterSeconds: resolvePositiveSafeInteger(
      activeArchiveAfterSeconds,
      DEFAULT_BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS,
      MAX_DATE_OFFSET_SECONDS,
    ),
    endedArchiveAfterSeconds: resolvePositiveSafeInteger(
      endedArchiveAfterSeconds,
      DEFAULT_BATTLE_ENDED_ARCHIVE_AFTER_SECONDS,
      MAX_DATE_OFFSET_SECONDS,
    ),
    intervalSeconds: resolvePositiveSafeInteger(
      intervalSeconds,
      DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS,
      MAX_TIMEOUT_SECONDS,
    ),
  };
}
