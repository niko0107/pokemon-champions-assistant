import { ApiError } from "../../lib/api-client";

const BATTLE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "入力内容を確認してください。",
  INVALID_PARTY_STATE:
    "このパーティでは対戦を開始できません。active状態と登録内容を確認してください。",
  INVALID_SESSION_STATE: "この対戦セッションには観測を追加できません。",
  INVALID_MASTER_REFERENCE:
    "選択したポケモンまたは技を確認し、検索候補からもう一度選び直してください。",
  NOT_FOUND: "対象の対戦セッションまたはパーティが見つかりません。",
  RATE_LIMITED: "入力が続いています。少し待ってからもう一度お試しください。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在、対戦操作を完了できません。時間をおいて再度お試しください。",
};

export function getBattleErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "処理を完了できませんでした。時間をおいて再度お試しください。";
  }

  const code = error.problem?.code;
  if (code && BATTLE_ERROR_MESSAGES[code]) {
    return BATTLE_ERROR_MESSAGES[code];
  }
  if (error.status === null) {
    return "サーバーへ接続できませんでした。通信環境を確認してください。";
  }
  return "処理を完了できませんでした。時間をおいて再度お試しください。";
}
