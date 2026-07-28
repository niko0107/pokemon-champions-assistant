import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";
import { battleQueryKeys, fetchBattleCounterplanExplanation } from "./battle-api";

const sessionId = "10000000-0000-4000-8000-000000000001";
const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user: {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "battle@example.com",
    displayName: "Battle Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

describe("WEB-009 counterplan explanation API client", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    useAuthStore.getState().setAuthenticated(authResponse);
  });

  it.each([
    { status: "pending", explanation: null },
    { status: "failed", explanation: null },
    { status: "unavailable", explanation: null },
    {
      status: "ready",
      explanation: {
        summary: "全体概要",
        selectionExplanation: "選出理由",
        perOpponent: [{ opponentPokemonId: 101, explanation: "相手別説明" }],
        strategyExplanation: "立ち回り",
      },
    },
  ] as const)("$statusをstrict schemaで取得する", async (response) => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(response)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBattleCounterplanExplanation(sessionId)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(
      new RegExp(`/api/v1/sessions/${sessionId}/counterplan/explanation$`, "u"),
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Bearer ${authResponse.accessToken}`,
    );
  });

  it("不正Session IDではHTTPリクエストを行わない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBattleCounterplanExplanation("not-a-uuid")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("余分なキーを含むレスポンスを拒否する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse({ status: "pending", explanation: null, cacheKey: "secret" })),
      ),
    );

    await expect(fetchBattleCounterplanExplanation(sessionId)).rejects.toThrow(
      "APIレスポンスの形式が正しくありません。",
    );
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [404, "NOT_FOUND"],
    [500, "INTERNAL_ERROR"],
  ])("%iのRFC 9457エラーをApiErrorとして維持する", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              type: "about:blank",
              title: "request failed",
              status,
              detail: "内部詳細",
              code,
            },
            status,
          ),
        ),
      ),
    );

    await expect(fetchBattleCounterplanExplanation(sessionId)).rejects.toMatchObject({
      name: "ApiError",
      status,
      problem: { code },
    });
  });

  it("401は既存refreshを経ても拒否された場合に認証エラーを返す", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            type: "about:blank",
            title: "unauthorized",
            status: 401,
            detail: "unauthorized",
            code: "UNAUTHORIZED",
          },
          401,
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBattleCounterplanExplanation(sessionId)).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("query keyはSessionとcounterplan更新を分離する", () => {
    expect(battleQueryKeys.counterplanExplanation(sessionId, 10)).toEqual([
      "battle",
      "counterplan-explanation",
      sessionId,
      10,
    ]);
    expect(battleQueryKeys.counterplanExplanation(sessionId, 10)).not.toEqual(
      battleQueryKeys.counterplanExplanation(sessionId, 11),
    );
  });
});
