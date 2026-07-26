import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api-client";
import { getAuthErrorMessage } from "./auth-errors";

describe("getAuthErrorMessage", () => {
  it.each([
    ["EMAIL_ALREADY_REGISTERED", "このメールアドレスはすでに登録されています。"],
    ["INVALID_CREDENTIALS", "メールアドレスまたはパスワードが正しくありません。"],
    ["INTERNAL_ERROR", "現在ログイン処理を利用できません。時間をおいて再度お試しください。"],
  ])("%sを固定のユーザー向け文言へ変換する", (code, expected) => {
    const error = new ApiError("server detail", {
      status:
        code === "EMAIL_ALREADY_REGISTERED" ? 409 : code === "INVALID_CREDENTIALS" ? 401 : 500,
      problem: {
        type: "about:blank",
        title: "Internal server title",
        status: 500,
        detail: "database host and private detail",
        code,
      },
    });

    expect(getAuthErrorMessage(error)).toBe(expected);
    expect(getAuthErrorMessage(error)).not.toContain("private detail");
  });

  it("不明な例外は内部文言を表示しない", () => {
    expect(getAuthErrorMessage(new Error("private detail"))).toBe("入力内容を確認してください。");
  });
});
