import type { ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { BattleRateLimitGuard } from "./battle-rate-limit.guard";
import type { BattleRateLimitService } from "./battle-rate-limit.service";

const userId = "fecccd4a-a137-4b3b-bb09-239306040706";

function createContext(user: AuthenticatedRequest["user"]): {
  context: ExecutionContext;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const setHeader = vi.fn();
  const request = {
    user,
    originalUrl: "/api/v1/sessions/session-id/observations",
  } as AuthenticatedRequest;
  const response = { setHeader } as unknown as Response;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
  return { context, setHeader };
}

describe("BattleRateLimitGuard", () => {
  it("上限内なら認証済みuserIdで処理を許可する", async () => {
    const consumeObservation = vi.fn(async () => ({ allowed: true }) as const);
    const guard = new BattleRateLimitGuard({
      consumeObservation,
    } as unknown as BattleRateLimitService);
    const { context, setHeader } = createContext({ id: userId, role: "user" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(consumeObservation).toHaveBeenCalledWith(userId);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("超過時はRetry-After付きRFC 9457形式の429を返す", async () => {
    const consumeObservation = vi.fn(
      async () => ({ allowed: false, retryAfterSeconds: 17 }) as const,
    );
    const guard = new BattleRateLimitGuard({
      consumeObservation,
    } as unknown as BattleRateLimitService);
    const { context, setHeader } = createContext({ id: userId, role: "admin" });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 429,
      response: {
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Observation request rate limit exceeded.",
        instance: "/api/v1/sessions/session-id/observations",
        code: "RATE_LIMITED",
      },
    });
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "17");
  });

  it("認証情報がなければ401を優先しRedisを呼ばない", async () => {
    const consumeObservation = vi.fn();
    const guard = new BattleRateLimitGuard({
      consumeObservation,
    } as unknown as BattleRateLimitService);
    const { context, setHeader } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: {
        status: 401,
        code: "UNAUTHORIZED",
      },
    });
    expect(consumeObservation).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });
});
