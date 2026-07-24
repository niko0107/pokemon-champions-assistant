import { describe, expect, it } from "vitest";
import {
  AUTH_PASSWORD_MAX_BYTES,
  authPasswordSchema,
  authResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
} from "./auth";

const validPassword = "correct-horse-42";

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
    user: {
      id: "fecccd4a-a137-4b3b-bb09-239306040706",
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
