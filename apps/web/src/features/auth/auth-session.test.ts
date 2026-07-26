import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  browserAuthStorage,
  createAuthSession,
  toPersistedAuthSession,
} from "./auth-session";

const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user: {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "trainer@example.com",
    displayName: "Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};

describe("auth session storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("access tokenは永続化せずrefresh token・公開user・期限だけ保存する", () => {
    const testNow = Date.now();
    const session = createAuthSession(authResponse, testNow);
    browserAuthStorage.write(toPersistedAuthSession(session));

    const raw = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? "";
    expect(raw).not.toContain(authResponse.accessToken);
    expect(raw).not.toContain("passwordHash");
    expect(browserAuthStorage.read()).toEqual({
      version: 1,
      refreshToken: authResponse.refreshToken,
      refreshExpiresAt: testNow + authResponse.refreshExpiresIn * 1_000,
      user: authResponse.user,
    });
  });

  it("破損データと期限切れデータは破棄する", () => {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, "{broken");
    expect(browserAuthStorage.read()).toBeNull();

    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        refreshToken: authResponse.refreshToken,
        refreshExpiresAt: Date.now() - 1,
        user: authResponse.user,
      }),
    );
    expect(browserAuthStorage.read()).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});
