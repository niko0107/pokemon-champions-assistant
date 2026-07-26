import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api-client";
import { getPartyErrorMessage } from "./party-errors";

describe("getPartyErrorMessage", () => {
  it.each([
    [
      "INVALID_MASTER_REFERENCE",
      "選択したポケモン、技、持ち物、特性の情報を確認し、もう一度選び直してください。",
    ],
    ["PARTY_CONFLICT", "同時にPartyが更新されました。内容を確認してもう一度保存してください。"],
    ["INTERNAL_ERROR", "現在Partyを保存できません。時間をおいて再度お試しください。"],
  ])("%sを安全な日本語へ変換する", (code, message) => {
    const error = new ApiError("private detail", {
      status: code === "PARTY_CONFLICT" ? 409 : code === "INTERNAL_ERROR" ? 500 : 400,
      problem: {
        type: "about:blank",
        title: "Private title",
        status: 500,
        detail: "private database detail",
        code,
      },
    });

    expect(getPartyErrorMessage(error)).toBe(message);
    expect(getPartyErrorMessage(error)).not.toContain("private");
  });

  it("通信エラーを区別する", () => {
    expect(getPartyErrorMessage(new ApiError("network"))).toBe(
      "サーバーへ接続できませんでした。通信環境を確認してください。",
    );
  });
});
