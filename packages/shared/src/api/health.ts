import { z } from "zod";

/**
 * GET /api/v1/health のレスポンススキーマ。
 * API 側は出力検証に、Web 側は受信データの検証に使用する。
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
