import { ApiError } from "../../lib/api-client";

const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "入力内容を確認してください。",
  EMAIL_ALREADY_REGISTERED: "このメールアドレスはすでに登録されています。",
  INVALID_CREDENTIALS: "メールアドレスまたはパスワードが正しくありません。",
  INVALID_REFRESH_TOKEN: "ログインの有効期限が切れました。もう一度ログインしてください。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在ログイン処理を利用できません。時間をおいて再度お試しください。",
};

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "入力内容を確認してください。";
  }

  const code = error.problem?.code;
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }

  if (error.status === null) {
    return "サーバーへ接続できませんでした。通信環境を確認してください。";
  }

  return "処理を完了できませんでした。時間をおいて再度お試しください。";
}
