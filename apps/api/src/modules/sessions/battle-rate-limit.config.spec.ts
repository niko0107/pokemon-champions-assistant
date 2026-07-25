import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATTLE_RATE_LIMIT,
  DEFAULT_BATTLE_RATE_LIMIT_WINDOW_SECONDS,
  resolveBattleRateLimitConfig,
} from "./battle-rate-limit.config";

describe("resolveBattleRateLimitConfig", () => {
  it.each([undefined, "", "  "])("未設定 %s では仕様の既定値を返す", (value) => {
    expect(resolveBattleRateLimitConfig(value, value)).toEqual({
      limit: DEFAULT_BATTLE_RATE_LIMIT,
      windowSeconds: DEFAULT_BATTLE_RATE_LIMIT_WINDOW_SECONDS,
    });
  });

  it("正の安全な整数を採用する", () => {
    expect(resolveBattleRateLimitConfig("20", "10")).toEqual({
      limit: 20,
      windowSeconds: 10,
    });
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])(
    "不正値 %s は各既定値へフォールバックする",
    (value) => {
      expect(resolveBattleRateLimitConfig(value, value)).toEqual({
        limit: DEFAULT_BATTLE_RATE_LIMIT,
        windowSeconds: DEFAULT_BATTLE_RATE_LIMIT_WINDOW_SECONDS,
      });
    },
  );
});
