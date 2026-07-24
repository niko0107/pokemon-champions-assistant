import { describe, expect, it } from "vitest";
import {
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_REFRESH_TOKEN_LENGTH,
  accessTokenPayloadSchema,
  authenticatedUserSchema,
  authPasswordSchema,
  authResponseSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from "./auth";

const validPassword = "correct-horse-42";
const validRefreshToken = "a".repeat(AUTH_REFRESH_TOKEN_LENGTH);
const validUserId = "fecccd4a-a137-4b3b-bb09-239306040706";

describe("accessTokenPayloadSchema", () => {
  const payload = {
    sub: validUserId,
    role: "user",
    iat: 1_753_401_600,
    exp: 1_753_402_500,
  };

  it("UUIDのsub、許可role、時刻claimを受理する", () => {
    expect(accessTokenPayloadSchema.parse(payload)).toEqual(payload);
    expect(authenticatedUserSchema.parse({ id: payload.sub, role: payload.role })).toEqual({
      id: validUserId,
      role: "user",
    });
  });

  it.each([
    ["UUIDでないsub", { ...payload, sub: "not-a-uuid" }],
    ["未許可role", { ...payload, role: "owner" }],
    ["expなし", { sub: payload.sub, role: payload.role, iat: payload.iat }],
  ])("%sを拒否する", (_label, invalidPayload) => {
    expect(accessTokenPayloadSchema.safeParse(invalidPayload).success).toBe(false);
  });
});

describe("registerRequestSchema", () => {
  it("emailとdisplayNameを正規化し、passwordは変更しない", () => {
    expect(
      registerRequestSchema.parse({
        email: "  Trainer@Example.COM ",
        password: validPassword,
        displayName: "  Trainer Red  ",
      }),
    ).toEqual({
      email: "trainer@example.com",
      password: validPassword,
      displayName: "Trainer Red",
    });
  });

  it("クライアントからroleを受け取らない", () => {
    expect(
      registerRequestSchema.safeParse({
        email: "trainer@example.com",
        password: validPassword,
        displayName: "Trainer",
        role: "admin",
      }).success,
    ).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("emailをtrim・小文字化する", () => {
    expect(
      loginRequestSchema.parse({
        email: " TRAINER@EXAMPLE.COM ",
        password: validPassword,
      }),
    ).toEqual({
      email: "trainer@example.com",
      password: validPassword,
    });
  });
});

describe("authPasswordSchema", () => {
  it("12文字以上で英字・数字を含む値を受理する", () => {
    expect(authPasswordSchema.parse(validPassword)).toBe(validPassword);
  });

  it.each([
    ["短すぎる", "short-1"],
    ["英字なし", "123456789012"],
    ["数字なし", "password-only"],
    ["制御文字", "password-123\n"],
    ["72バイト超", `${"a".repeat(AUTH_PASSWORD_MAX_BYTES - 1)}1あ`],
  ])("%sパスワードを拒否する", (_label, password) => {
    expect(authPasswordSchema.safeParse(password).success).toBe(false);
  });
});

describe("authResponseSchema", () => {
  const response = {
    accessToken: "header.payload.signature",
    tokenType: "Bearer",
    expiresIn: 900,
    refreshToken: validRefreshToken,
    refreshExpiresIn: 2_592_000,
    user: {
      id: validUserId,
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "user",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  };

  it("アクセストークンと公開ユーザー情報を受理する", () => {
    expect(authResponseSchema.parse(response)).toEqual(response);
  });

  it("passwordHashを含むレスポンスを拒否する", () => {
    expect(
      authResponseSchema.safeParse({
        ...response,
        user: { ...response.user, passwordHash: "$2b$12$not-exposed" },
      }).success,
    ).toBe(false);
  });
});

describe("refreshRequestSchema", () => {
  it("32バイトのbase64url形式opaque tokenを受理する", () => {
    expect(refreshRequestSchema.parse({ refreshToken: validRefreshToken })).toEqual({
      refreshToken: validRefreshToken,
    });
  });

  it.each([
    ["短いtoken", "short", undefined],
    ["base64url以外", `${"a".repeat(AUTH_REFRESH_TOKEN_LENGTH - 1)}+`, undefined],
    ["余分なフィールド", validRefreshToken, "unexpected"],
  ])("%sを拒否する", (_label, refreshToken, extra) => {
    const input = extra === undefined ? { refreshToken } : { refreshToken, extra };

    expect(refreshRequestSchema.safeParse(input).success).toBe(false);
  });
});
