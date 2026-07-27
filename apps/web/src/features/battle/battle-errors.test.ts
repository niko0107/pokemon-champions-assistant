import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api-client";
import {
  getBattleCandidatesErrorMessage,
  getBattleCounterplanErrorMessage,
  getBattleErrorMessage,
  getBattleSelectionErrorMessage,
  getBattleUndoErrorMessage,
} from "./battle-errors";

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

describe("getBattleUndoErrorMessage", () => {
  it.each([
    ["INVALID_SESSION_STATE", 400, "取り消せません"],
    ["NOT_FOUND", 404, "見つかりません"],
    ["OBSERVATION_CONFLICT", 409, "観測状態が更新されています"],
    ["UNAUTHORIZED", 401, "ログイン"],
    ["INTERNAL_ERROR", 500, "時間をおいて"],
  ])("RFC 9457 code %sを安全な文言へ変換する", (code, status, message) => {
    const error = new ApiError("internal title", {
      status,
      problem: {
        type: "about:blank",
        title: "internal title",
        status,
        detail: "表示してはいけない内部情報",
        code,
      },
    });

    expect(getBattleUndoErrorMessage(error)).toContain(message);
    expect(getBattleUndoErrorMessage(error)).not.toContain("表示してはいけない内部情報");
  });

  it("通信エラーを区別する", () => {
    expect(getBattleUndoErrorMessage(new ApiError("network"))).toContain("通信環境");
  });
});

describe("getBattleSelectionErrorMessage", () => {
  it.each([
    ["INVALID_SESSION_STATE", 400, "選択できません"],
    ["INVALID_ARCHETYPE_SELECTION", 400, "選び直してください"],
    ["BATTLE_CONFLICT", 409, "すでに選択済み"],
    ["NOT_FOUND", 404, "見つかりません"],
    ["UNAUTHORIZED", 401, "ログイン"],
  ])("%sを安全な候補選択エラーへ変換する", (code, status, message) => {
    const result = getBattleSelectionErrorMessage(
      new ApiError("internal title", {
        status,
        problem: {
          type: "about:blank",
          title: "internal title",
          status,
          detail: "表示してはいけない内部情報",
          code,
        },
      }),
    );
    expect(result).toContain(message);
    expect(result).not.toContain("表示してはいけない内部情報");
  });
});

describe("getBattleCounterplanErrorMessage", () => {
  it.each([
    ["VALIDATION_ERROR", 400, "ID"],
    ["INVALID_SESSION_STATE", 400, "archived"],
    ["INVALID_PARTY_STATE", 400, "パーティ"],
    ["INVALID_ARCHETYPE_SELECTION", 400, "まだ選択されていない"],
    ["NOT_FOUND", 404, "権限"],
    ["UNAUTHORIZED", 401, "ログイン"],
    ["INTERNAL_ERROR", 500, "対策を計算できません"],
  ])("%sを握りつぶさず安全な対策エラーへ変換する", (code, status, message) => {
    const result = getBattleCounterplanErrorMessage(
      new ApiError("internal title", {
        status,
        problem: {
          type: "about:blank",
          title: "internal title",
          status,
          detail: "actualStatsを含む内部情報",
          code,
        },
      }),
    );
    expect(result).toContain(message);
    expect(result).not.toContain("actualStats");
  });

  it("通信エラーを区別する", () => {
    expect(getBattleCounterplanErrorMessage(new ApiError("network"))).toContain("通信環境");
  });
});
