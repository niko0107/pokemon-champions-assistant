/** API のグローバルプレフィックス(NestJS setGlobalPrefix / クライアント両方で使用) */
export const API_PREFIX = "api/v1";

/** クライアントから見た API ベースパス */
export const API_BASE_PATH = `/${API_PREFIX}`;

/** 候補表示件数の既定値(設計書 付録B: candidates.display_count) */
export const DEFAULT_CANDIDATE_DISPLAY_COUNT = 3;

/** おすすめポケモン表示数の既定値(設計書 付録B: recommend.display_count) */
export const DEFAULT_RECOMMEND_DISPLAY_COUNT = 3;

/** 対戦セッション保持日数(設計書 付録B: session.archive_days) */
export const DEFAULT_SESSION_ARCHIVE_DAYS = 90;
