import { problemDetailsSchema } from "@pokemon-champions/shared";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, type ApiAuthSessionAdapter } from "./api-client";

const now = Date.now();
const user = {
  id: "fecccd4a-a137-4b3b-bb09-239306040706",
  email: "trainer@example.com",
  displayName: "Trainer",
  role: "user" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
};
const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user,
};

type StoredSession = ReturnType<ApiAuthSessionAdapter["getSession"]>;

function createAdapter(initialSession: StoredSession) {
  let session = initialSession;
  const adapter: ApiAuthSessionAdapter = {
    getSession: () => session,
    setAuthenticated: vi.fn((response) => {
      session = {
        version: 1,
        accessToken: response.accessToken,
        accessExpiresAt: Date.now() + response.expiresIn * 1_000,
        refreshToken: response.refreshToken,
        refreshExpiresAt: Date.now() + response.refreshExpiresIn * 1_000,
        user: response.user,
      };
    }),
    clearAuthentication: vi.fn(() => {
      session = null;
    }),
  };

  return adapter;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("認証済みリクエストへAuthorizationヘッダーを付ける", async () => {
    const adapter = createAdapter({
      version: 1,
      accessToken: "existing.access.token",
      accessExpiresAt: now + 60_000,
      refreshToken: "r".repeat(43),
      refreshExpiresAt: now + 120_000,
      user,
    });
    const fetchImplementation = vi.fn().mockResolvedValue(response({ ok: true }));
    const client = new ApiClient(fetchImplementation, adapter, "https://example.test");

    await client.request("/protected", {
      authenticated: true,
      responseSchema: z.object({ ok: z.literal(true) }),
    });

    const requestInit = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Authorization")).toBe(
      "Bearer existing.access.token",
    );
  });

  it("RFC 9457エラーを安全にparseする", async () => {
    const adapter = createAdapter(null);
    const problem = problemDetailsSchema.parse({
      type: "about:blank",
      title: "Invalid Credentials",
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    const client = new ApiClient(
      vi.fn().mockResolvedValue(response(problem, 401)),
      adapter,
      "https://example.test",
    );

    const error = await client
      .login({ email: "trainer@example.com", password: "correct-horse-42" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, problem });
  });

  it("同時リクエストのrefreshを1回にまとめ、更新後の元リクエストを実行する", async () => {
    const adapter = createAdapter({
      version: 1,
      accessToken: null,
      accessExpiresAt: null,
      refreshToken: "r".repeat(43),
      refreshExpiresAt: now + 120_000,
      user,
    });
    let resolveRefresh: ((value: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchImplementation = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return refreshResponse;
      }
      return Promise.resolve(response({ ok: true }));
    });
    const client = new ApiClient(fetchImplementation, adapter, "https://example.test");
    const schema = z.object({ ok: z.literal(true) });

    const first = client.request("/protected", { authenticated: true, responseSchema: schema });
    const second = client.request("/protected", { authenticated: true, responseSchema: schema });
    resolveRefresh?.(response(authResponse));

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(
      fetchImplementation.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("401ではrefresh後に元リクエストを1回だけ再実行する", async () => {
    const adapter = createAdapter({
      version: 1,
      accessToken: "expired.access.token",
      accessExpiresAt: now + 60_000,
      refreshToken: "r".repeat(43),
      refreshExpiresAt: now + 120_000,
      user,
    });
    let protectedCalls = 0;
    const fetchImplementation = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(response(authResponse));
      }
      protectedCalls += 1;
      return Promise.resolve(
        protectedCalls === 1
          ? response({ title: "Unauthorized", status: 401, code: "UNAUTHORIZED" }, 401)
          : response({ ok: true }),
      );
    });
    const client = new ApiClient(fetchImplementation, adapter, "https://example.test");

    await expect(
      client.request("/protected", {
        authenticated: true,
        responseSchema: z.object({ ok: z.literal(true) }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(protectedCalls).toBe(2);
    expect(adapter.setAuthenticated).toHaveBeenCalledOnce();
  });

  it("refresh失敗時は認証を破棄し、無限retryしない", async () => {
    const adapter = createAdapter({
      version: 1,
      accessToken: "expired.access.token",
      accessExpiresAt: now + 60_000,
      refreshToken: "r".repeat(43),
      refreshExpiresAt: now + 120_000,
      user,
    });
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        response({ title: "Unauthorized", status: 401, code: "UNAUTHORIZED" }, 401),
      )
      .mockResolvedValueOnce(
        response(
          { title: "Invalid Refresh Token", status: 401, code: "INVALID_REFRESH_TOKEN" },
          401,
        ),
      );
    const client = new ApiClient(fetchImplementation, adapter, "https://example.test");

    await expect(
      client.request("/protected", {
        authenticated: true,
        responseSchema: z.object({ ok: z.literal(true) }),
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(adapter.clearAuthentication).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("通信エラーを内部情報なしのApiErrorへ変換する", async () => {
    const adapter = createAdapter(null);
    const client = new ApiClient(
      vi.fn().mockRejectedValue(new Error("secret upstream URL")),
      adapter,
      "https://example.test",
    );

    const error = await client
      .login({ email: "trainer@example.com", password: "correct-horse-42" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(String(error)).not.toContain("secret upstream URL");
  });
});
