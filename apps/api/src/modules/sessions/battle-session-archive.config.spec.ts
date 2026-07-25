import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS,
  DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS,
  DEFAULT_BATTLE_ENDED_ARCHIVE_AFTER_SECONDS,
  resolveBattleSessionArchiveConfig,
} from "./battle-session-archive.config";

describe("resolveBattleSessionArchiveConfig", () => {
  it.each([undefined, "", "  "])("未設定 %s では仕様の既定値を返す", (value) => {
    expect(resolveBattleSessionArchiveConfig(value, value, value)).toEqual({
      activeArchiveAfterSeconds: DEFAULT_BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS,
      endedArchiveAfterSeconds: DEFAULT_BATTLE_ENDED_ARCHIVE_AFTER_SECONDS,
      intervalSeconds: DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS,
    });
  });

  it("active・ended・intervalを独立した正の安全な整数として採用する", () => {
    expect(resolveBattleSessionArchiveConfig("120", "240", "30")).toEqual({
      activeArchiveAfterSeconds: 120,
      endedArchiveAfterSeconds: 240,
      intervalSeconds: 30,
    });
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])(
    "不正値 %s は各既定値へフォールバックする",
    (value) => {
      expect(resolveBattleSessionArchiveConfig(value, value, value)).toEqual({
        activeArchiveAfterSeconds: DEFAULT_BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS,
        endedArchiveAfterSeconds: DEFAULT_BATTLE_ENDED_ARCHIVE_AFTER_SECONDS,
        intervalSeconds: DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS,
      });
    },
  );

  it("setIntervalの上限を超えるintervalは既定値へフォールバックする", () => {
    expect(resolveBattleSessionArchiveConfig("120", "240", "2147484")).toEqual({
      activeArchiveAfterSeconds: 120,
      endedArchiveAfterSeconds: 240,
      intervalSeconds: DEFAULT_BATTLE_ARCHIVE_INTERVAL_SECONDS,
    });
  });
});
