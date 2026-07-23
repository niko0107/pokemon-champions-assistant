import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema, type HealthResponse } from "@pokemon-champions/shared";
import { apiGet } from "../../lib/api-client";

/** GET /api/v1/health を呼び出す(API 疎通確認用) */
export function useHealthQuery() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => apiGet("/health", healthResponseSchema),
  });
}
