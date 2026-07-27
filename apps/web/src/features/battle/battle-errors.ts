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

const CANDIDATE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_SESSION_STATE: "この対戦セッションでは候補を取得できません。",
  NOT_FOUND: "対象の対戦セッションが見つかりません。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在、候補を取得できません。時間をおいて再度お試しください。",
};

const UNDO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_SESSION_STATE: "この対戦セッションでは観測を取り消せません。",
  NOT_FOUND: "対象の対戦セッションまたは観測が見つかりません。",
  OBSERVATION_CONFLICT: "観測状態が更新されています。画面の内容を確認してください。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在、観測を取り消せません。時間をおいて再度お試しください。",
};

const SELECTION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_SESSION_STATE: "この対戦セッションでは構築候補を選択できません。",
  INVALID_ARCHETYPE_SELECTION:
    "この構築候補は現在選択できません。候補を更新してから選び直してください。",
  BATTLE_CONFLICT: "構築候補はすでに選択済みです。対策タブを開いて現在の対策を確認してください。",
  NOT_FOUND: "対象の対戦セッションが見つかりません。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "現在、構築候補を選択できません。時間をおいて再度お試しください。",
};

const COUNTERPLAN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "対戦セッションIDが正しくありません。",
  INVALID_SESSION_STATE:
    "この対戦セッションの状態では対策を取得できません。archived済みでないか確認してください。",
  INVALID_PARTY_STATE:
    "使用パーティの状態が対策計算の条件を満たしていません。登録内容を確認してください。",
  INVALID_ARCHETYPE_SELECTION:
    "構築候補がまだ選択されていないか、現在利用できない構築です。候補タブから選択してください。",
  NOT_FOUND: "対象の対戦セッションが見つからないか、表示する権限がありません。",
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください。",
  INTERNAL_ERROR: "保存された対戦データから対策を計算できません。時間をおいて再度お試しください。",
};

function errorMessage(
  error: unknown,
  messages: Readonly<Record<string, string>>,
  fallback: string,
  network: string,
): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  const code = error.problem?.code;
  if (code && messages[code]) {
    return messages[code];
  }
  return error.status === null ? network : fallback;
}

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

export function getBattleCandidatesErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "候補を取得できませんでした。時間をおいて再度お試しください。";
  }

  const code = error.problem?.code;
  if (code && CANDIDATE_ERROR_MESSAGES[code]) {
    return CANDIDATE_ERROR_MESSAGES[code];
  }
  if (error.status === null) {
    return "候補を取得できませんでした。通信環境を確認してください。";
  }
  return "候補を取得できませんでした。時間をおいて再度お試しください。";
}

export function getBattleUndoErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "観測を取り消せませんでした。時間をおいて再度お試しください。";
  }

  const code = error.problem?.code;
  if (code && UNDO_ERROR_MESSAGES[code]) {
    return UNDO_ERROR_MESSAGES[code];
  }
  if (error.status === null) {
    return "観測を取り消せませんでした。通信環境を確認してください。";
  }
  return "観測を取り消せませんでした。時間をおいて再度お試しください。";
}

export function getBattleSelectionErrorMessage(error: unknown): string {
  return errorMessage(
    error,
    SELECTION_ERROR_MESSAGES,
    "構築候補を選択できませんでした。時間をおいて再度お試しください。",
    "構築候補を選択できませんでした。通信環境を確認してください。",
  );
}

export function getBattleCounterplanErrorMessage(error: unknown): string {
  return errorMessage(
    error,
    COUNTERPLAN_ERROR_MESSAGES,
    "対策を取得できませんでした。時間をおいて再度お試しください。",
    "対策を取得できませんでした。通信環境を確認してください。",
  );
}
