import { API_BASE_PATH } from "@pokemon-champions/shared";
import type { ZodSchema } from "zod";

/**
 * API クライアントの共通 fetch ラッパー。
 * レスポンスは必ず zod スキーマで検証する(開発ルール)。
 * ベース URL は VITE_API_BASE_URL(未設定時は同一オリジン+Vite プロキシ)。
 */
const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function apiGet<T>(path: string, schema: ZodSchema<T>): Promise<T> {
  const res = await fetch(`${baseUrl}${API_BASE_PATH}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}
