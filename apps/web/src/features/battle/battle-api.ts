import {
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  observationCreateSchema,
  observationResponseSchema,
  type BattleSessionCreate,
  type BattleSessionResponse,
  type ObservationResponse,
} from "@pokemon-champions/shared";
import { apiClient } from "../../lib/api-client";

export const battleQueryKeys = {
  session: (sessionId: string) => ["battle", "session", sessionId] as const,
  pokemonSearch: (query: string) => ["battle", "pokemon-search", query] as const,
};

export function createBattleSession(input: BattleSessionCreate): Promise<BattleSessionResponse> {
  return apiClient.request<BattleSessionResponse>("/sessions", {
    method: "POST",
    body: battleSessionCreateSchema.parse(input),
    authenticated: true,
    responseSchema: battleSessionResponseSchema,
  });
}

export function fetchBattleSession(sessionId: string): Promise<BattleSessionResponse> {
  return apiClient.request<BattleSessionResponse>(`/sessions/${sessionId}`, {
    authenticated: true,
    responseSchema: battleSessionResponseSchema,
  });
}

export function addPokemonObservation(
  sessionId: string,
  pokemonId: number,
): Promise<ObservationResponse> {
  return apiClient.request<ObservationResponse>(`/sessions/${sessionId}/observations`, {
    method: "POST",
    body: observationCreateSchema.parse({ kind: "pokemon", pokemonId }),
    authenticated: true,
    responseSchema: observationResponseSchema,
  });
}
