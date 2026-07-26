import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api-client";
import { getBattleCandidatesErrorMessage, getBattleErrorMessage } from "./battle-errors";

describe("getBattleErrorMessage", () => {
  it.each([
    ["INVALID_PARTY_STATE", "このパーティでは対戦を開始できません"],
    ["INVALID_SESSION_STATE", "この対戦セッションには観測を追加できません"],
    ["INVALID_MASTER_REFERENCE", "検索候補からもう一度選び直してください"],
    ["NOT_FOUND", "見つかりません"],
    ["RATE_LIMITED", "少し待って"],
  ])("%sを安全な日本語へ変換する", (code, message) => {
    expect(
      getBattleErrorMessage(
        new ApiError("server detail", {
          status: code === "NOT_FOUND" ? 404 : 400,
          problem: {
            type: "about:blank",
            title: "Internal title",
            status: 400,
            detail: "表示してはいけない内部情報",
            code,
          },
        }),
      ),
    ).toContain(message);
    expect(
      getBattleErrorMessage(
        new ApiError("server detail", {
          status: 400,
          problem: {
            type: "about:blank",
            title: "Internal title",
            status: 400,
            detail: "表示してはいけない内部情報",
            code,
          },
        }),
      ),
    ).not.toContain("表示してはいけない内部情報");
  });

  it("通信エラーを区別する", () => {
    expect(getBattleErrorMessage(new ApiError("network"))).toContain("通信環境");
  });
});

describe("getBattleCandidatesErrorMessage", () => {
  it.each([
    ["INVALID_SESSION_STATE", 400, "候補を取得できません"],
    ["NOT_FOUND", 404, "見つかりません"],
    ["UNAUTHORIZED", 401, "ログインの有効期限"],
    ["INTERNAL_ERROR", 500, "時間をおいて"],
  ])("%sを内部detailなしの日本語へ変換する", (code, status, message) => {
    const result = getBattleCandidatesErrorMessage(
      new ApiError("server detail", {
        status,
        problem: {
          type: "about:blank",
          title: "Internal title",
          status,
          detail: "表示してはいけないRedis内部情報",
          code,
        },
      }),
    );
    expect(result).toContain(message);
    expect(result).not.toContain("Redis");
  });

  it("通信エラーを区別する", () => {
    expect(getBattleCandidatesErrorMessage(new ApiError("network"))).toContain("通信環境");
  });
});
