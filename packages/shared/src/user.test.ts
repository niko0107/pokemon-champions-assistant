import { describe, expect, it } from "vitest";
import {
  USER_DISPLAY_NAME_MAX_LENGTH,
  USER_EMAIL_MAX_LENGTH,
  userDisplayNameSchema,
  userEmailSchema,
  userRoleSchema,
  userSchema,
} from "./user";

describe("userRoleSchema", () => {
  it.each(["user", "admin"] as const)("%sを受理する", (role) => {
    expect(userRoleSchema.parse(role)).toBe(role);
  });

  it("未許可のroleを拒否する", () => {
    expect(userRoleSchema.safeParse("owner").success).toBe(false);
  });
});

describe("userEmailSchema", () => {
  it("前後空白を除去し、小文字化する", () => {
    expect(userEmailSchema.parse("  Trainer.Example@Example.COM  ")).toBe(
      "trainer.example@example.com",
    );
  });

  it.each(["", "not-an-email", `a@${"b".repeat(USER_EMAIL_MAX_LENGTH)}.com`])(
    "不正なemailを拒否する: %s",
    (email) => {
      expect(userEmailSchema.safeParse(email).success).toBe(false);
    },
  );
});

describe("userDisplayNameSchema", () => {
  it("前後空白を除去し、表示上の大文字小文字を維持する", () => {
    expect(userDisplayNameSchema.parse("  Trainer Red  ")).toBe("Trainer Red");
  });

  it.each(["", "   ", "a".repeat(USER_DISPLAY_NAME_MAX_LENGTH + 1)])(
    "空または長すぎる表示名を拒否する",
    (displayName) => {
      expect(userDisplayNameSchema.safeParse(displayName).success).toBe(false);
    },
  );
});

describe("userSchema", () => {
  const user = {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "trainer@example.com",
    displayName: "トレーナー",
    role: "user",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };

  it("クライアントと共有可能なユーザー情報を受理する", () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  it("passwordHashを含むオブジェクトを拒否する", () => {
    expect(
      userSchema.safeParse({
        ...user,
        passwordHash: "$2b$12$example-hash-is-not-test-data",
      }).success,
    ).toBe(false);
  });
});
