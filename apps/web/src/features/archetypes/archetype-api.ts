import {
  archetypeDetailParamsSchema,
  publicArchetypeDetailSchema,
  type PublicArchetypeDetail,
} from "@pokemon-champions/shared";
import { ApiError, apiClient } from "../../lib/api-client";

export const archetypeQueryKeys = {
  detail: (archetypeId: string) => ["archetypes", "detail", archetypeId] as const,
};

export async function fetchArchetypeDetail(archetypeId: string): Promise<PublicArchetypeDetail> {
  const params = archetypeDetailParamsSchema.parse({ id: archetypeId });
  const response = await apiClient.request<PublicArchetypeDetail>(`/archetypes/${params.id}`, {
    authenticated: true,
    responseSchema: publicArchetypeDetailSchema,
  });
  if (response.id !== params.id) {
    throw new ApiError("APIレスポンスの形式が正しくありません。");
  }
  return response;
}
