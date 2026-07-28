import {
  battleCandidateSelectResponseSchema,
  battleCandidateSelectSchema,
  battleCandidatesResponseSchema,
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  observationCreateSchema,
  observationResponseSchema,
  sessionCounterplanExplanationStatusParamsSchema,
  sessionCounterplanExplanationStatusResponseSchema,
  sessionCounterplanResponseSchema,
  undoObservationResponseSchema,
  type BattleCandidateSelectResponse,
  type BattleCandidatesResponse,
  type BattleSessionCreate,
  type BattleSessionResponse,
  type ObservationResponse,
  type SessionCounterplanExplanationStatusResponse,
  type SessionCounterplanResponse,
  type UndoObservationResponse,
} from "@pokemon-champions/shared";
import { ApiError, apiClient } from "../../lib/api-client";

export const battleQueryKeys = {
  session: (sessionId: string) => ["battle", "session", sessionId] as const,
  candidates: (sessionId: string) => ["battle", "candidates", sessionId] as const,
  counterplan: (sessionId: string) => ["battle", "counterplan", sessionId] as const,
  counterplanExplanation: (sessionId: string, counterplanUpdatedAt: number) =>
    ["battle", "counterplan-explanation", sessionId, counterplanUpdatedAt] as const,
  pokemonSearch: (query: string) => ["battle", "pokemon-search", query] as const,
  moveSearch: (pokemonId: number, query: string) =>
    ["battle", "move-search", pokemonId, query] as const,
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

export async function fetchBattleCandidates(sessionId: string): Promise<BattleCandidatesResponse> {
  const response = await apiClient.request<BattleCandidatesResponse>(
    `/sessions/${sessionId}/candidates`,
    {
      authenticated: true,
      responseSchema: battleCandidatesResponseSchema,
    },
  );
  if (response.sessionId !== sessionId) {
    throw new ApiError("APIレスポンスの形式が正しくありません。");
  }
  return response;
}

export async function selectBattleCandidate(
  sessionId: string,
  archetypeId: string,
): Promise<BattleCandidateSelectResponse> {
  const response = await apiClient.request<BattleCandidateSelectResponse>(
    `/sessions/${sessionId}/select`,
    {
      method: "POST",
      body: battleCandidateSelectSchema.parse({ archetypeId }),
      authenticated: true,
      responseSchema: battleCandidateSelectResponseSchema,
    },
  );
  if (response.sessionId !== sessionId || response.selectedArchetypeId !== archetypeId) {
    throw new ApiError("APIレスポンスの形式が正しくありません。");
  }
  return response;
}

export async function fetchBattleCounterplan(
  sessionId: string,
): Promise<SessionCounterplanResponse> {
  const response = await apiClient.request<SessionCounterplanResponse>(
    `/sessions/${sessionId}/counterplan`,
    {
      authenticated: true,
      responseSchema: sessionCounterplanResponseSchema,
    },
  );
  if (response.sessionId !== sessionId) {
    throw new ApiError("APIレスポンスの形式が正しくありません。");
  }
  return response;
}

export async function fetchBattleCounterplanExplanation(
  sessionId: string,
): Promise<SessionCounterplanExplanationStatusResponse> {
  const { id } = sessionCounterplanExplanationStatusParamsSchema.parse({ id: sessionId });
  return apiClient.request<SessionCounterplanExplanationStatusResponse>(
    `/sessions/${id}/counterplan/explanation`,
    {
      authenticated: true,
      responseSchema: sessionCounterplanExplanationStatusResponseSchema,
    },
  );
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

export function addMoveObservation(
  sessionId: string,
  pokemonId: number,
  moveId: number,
): Promise<ObservationResponse> {
  return apiClient.request<ObservationResponse>(`/sessions/${sessionId}/observations`, {
    method: "POST",
    body: observationCreateSchema.parse({ kind: "move", pokemonId, moveId }),
    authenticated: true,
    responseSchema: observationResponseSchema,
  });
}

export async function undoBattleObservation(
  sessionId: string,
  observationId: string,
): Promise<UndoObservationResponse> {
  const response = await apiClient.request<UndoObservationResponse>(
    `/sessions/${sessionId}/observations/${observationId}`,
    {
      method: "DELETE",
      authenticated: true,
      responseSchema: undoObservationResponseSchema,
    },
  );
  if (response.sessionId !== sessionId || response.id !== observationId) {
    throw new ApiError("APIレスポンスの形式が正しくありません。");
  }
  return response;
}
