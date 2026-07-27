import { ApiError } from "../../lib/api-client";

const ARCHETYPE_DETAIL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "構築IDが正しくありません。",
  NOT_FOUND: "構築が見つからないか、現在は公開されていません。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在、構築詳細を表示できません。時間をおいて再度お試しください。",
};

export function getArchetypeDetailErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "構築詳細を表示できませんでした。時間をおいて再度お試しください。";
  }
  const code = error.problem?.code;
  if (code && ARCHETYPE_DETAIL_ERROR_MESSAGES[code]) {
    return ARCHETYPE_DETAIL_ERROR_MESSAGES[code];
  }
  if (error.status === null) {
    return "構築詳細を取得できませんでした。通信環境を確認してください。";
  }
  return "構築詳細を表示できませんでした。時間をおいて再度お試しください。";
}
