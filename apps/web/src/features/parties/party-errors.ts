import { ApiError } from "../../lib/api-client";

const PARTY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "入力内容を確認してください。",
  INVALID_MASTER_REFERENCE:
    "選択したポケモン、技、持ち物、特性の情報を確認し、もう一度選び直してください。",
  PARTY_CONFLICT: "同時にPartyが更新されました。内容を確認してもう一度保存してください。",
  NOT_FOUND: "選択したデータが見つかりません。候補を選び直してください。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在Partyを保存できません。時間をおいて再度お試しください。",
};

export function getPartyErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "処理を完了できませんでした。時間をおいて再度お試しください。";
  }

  const code = error.problem?.code;
  if (code && PARTY_ERROR_MESSAGES[code]) {
    return PARTY_ERROR_MESSAGES[code];
  }
  if (error.status === null) {
    return "サーバーへ接続できませんでした。通信環境を確認してください。";
  }
  return "処理を完了できませんでした。時間をおいて再度お試しください。";
}
