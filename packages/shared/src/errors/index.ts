import { z } from "zod";

/**
 * エラーレスポンス: RFC 9457 (Problem Details for HTTP APIs) 形式。
 * 設計書 §10.1 共通仕様に対応。
 */
export const problemDetailsSchema = z.object({
  /** エラー種別を示す URI(未分類は "about:blank") */
  type: z.string().default("about:blank"),
  /** 人間可読な短いタイトル */
  title: z.string(),
  /** HTTP ステータスコード */
  status: z.number().int(),
  /** このエラー固有の詳細説明 */
  detail: z.string().optional(),
  /** エラーが発生したリソースの URI */
  instance: z.string().optional(),
  /** アプリ固有のエラーコード */
  code: z.string().optional(),
  /** バリデーションエラー等の詳細(フィールド別) */
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** アプリ固有エラーコード(必要になった時点で追加する) */
export const APP_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
