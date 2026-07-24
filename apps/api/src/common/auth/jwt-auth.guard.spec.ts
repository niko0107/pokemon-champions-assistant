import type { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./authenticated-request";
import { JwtAuthGuard } from "./jwt-auth.guard";

const TEST_ACCESS_SECRET = "auth-004-unit-access-secret-at-least-32-bytes";
const OTHER_ACCESS_SECRET = "auth-004-other-access-secret-at-least-32-bytes";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";

function createContext(
  authorization?: string,
): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;

  return { context, request };
}

describe("JwtAuthGuard", () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const jwt = new JwtService();
  const guard = new JwtAuthGuard(jwt);

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  });

  afterAll(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  async function sign(
    payload: Record<string, unknown>,
    options: { secret?: string; expiresIn?: number } = {},
  ): Promise<string> {
    return jwt.signAsync(payload, {
      algorithm: "HS256",
      secret: options.secret ?? TEST_ACCESS_SECRET,
      expiresIn: options.expiresIn ?? 900,
    });
  }

  it("正しいBearer tokenを認証し、型安全なuserをrequestへ設定する", async () => {
    const token = await sign({ sub: userId, role: "user" });
    const { context, request } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: userId, role: "user" });
  });

  it.each([
    ["Authorizationなし", undefined],
    ["Bearer形式不正", "Basic credentials"],
    ["tokenなし", "Bearer "],
  ])("%sを共通401にする", async (_label, authorization) => {
    const { context } = createContext(authorization);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: {
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        code: "UNAUTHORIZED",
      },
    });
  });

  it.each([
    [
      "署名不正",
      () => sign({ sub: userId, role: "user" }, { secret: OTHER_ACCESS_SECRET }),
    ],
    ["期限切れ", () => sign({ sub: userId, role: "user" }, { expiresIn: -1 })],
    [
      "HS256以外の署名アルゴリズム",
      () =>
        jwt.signAsync(
          { sub: userId, role: "user" },
          {
            algorithm: "HS384",
            secret: TEST_ACCESS_SECRET,
            expiresIn: 900,
          },
        ),
    ],
    ["sub不正", () => sign({ sub: "not-a-uuid", role: "user" })],
    ["role不正", () => sign({ sub: userId, role: "owner" })],
  ])("%sを共通401にし、秘密情報を返さない", async (_label, createToken) => {
    const token = await createToken();
    const { context } = createContext(`Bearer ${token}`);
    const error = await guard.canActivate(context).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 401,
      response: {
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        code: "UNAUTHORIZED",
      },
    });
    expect(JSON.stringify(error)).not.toContain(token);
    expect(JSON.stringify(error)).not.toContain(TEST_ACCESS_SECRET);
  });

  it("JWT_ACCESS_SECRETの設定不備は秘密情報を含まない500にする", async () => {
    process.env.JWT_ACCESS_SECRET = "too-short";
    const token = await sign({ sub: userId, role: "user" });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 500,
      response: {
        title: "Authentication Service Unavailable",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });
});
