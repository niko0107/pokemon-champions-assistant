import {
  abilitySearchResponseSchema,
  itemSearchResponseSchema,
  masterPokemonDetailSchema,
  masterRulesResponseSchema,
  moveSearchResponseSchema,
  partyDetailSchema,
  partyListResponseSchema,
  pokemonSearchResponseSchema,
  type AbilitySearchResponse,
  type ItemSearchResponse,
  type MasterPokemonDetail,
  type MasterRulesResponse,
  type MoveSearchResponse,
  type PartyDetail,
  type PartyListResponse,
  type PartyWrite,
  type PokemonSearchResponse,
} from "@pokemon-champions/shared";
import { apiClient } from "../../lib/api-client";

export const partyQueryKeys = {
  all: ["parties"] as const,
  rules: ["master", "rules"] as const,
  pokemonSearch: (query: string) => ["master", "pokemons", "search", query] as const,
  pokemonDetail: (id: number) => ["master", "pokemons", id] as const,
  moveSearch: (pokemonId: number, query: string) => ["master", "moves", pokemonId, query] as const,
  itemSearch: (query: string) => ["master", "items", query] as const,
  abilities: (pokemonId: number) => ["master", "abilities", pokemonId] as const,
};

function queryString(params: Record<string, string | number>): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export function fetchParties(): Promise<PartyListResponse> {
  return apiClient.request<PartyListResponse>("/parties", {
    authenticated: true,
    responseSchema: partyListResponseSchema,
  });
}

export function createParty(input: PartyWrite): Promise<PartyDetail> {
  return apiClient.request<PartyDetail>("/parties", {
    method: "POST",
    body: input,
    authenticated: true,
    responseSchema: partyDetailSchema,
  });
}

export function fetchRules(): Promise<MasterRulesResponse> {
  return apiClient.request<MasterRulesResponse>("/master/rules", {
    responseSchema: masterRulesResponseSchema,
  });
}

export function searchPokemons(query: string): Promise<PokemonSearchResponse> {
  return apiClient.request<PokemonSearchResponse>(`/master/pokemons?${queryString({ q: query })}`, {
    responseSchema: pokemonSearchResponseSchema,
  });
}

export function fetchPokemonDetail(id: number): Promise<MasterPokemonDetail> {
  return apiClient.request<MasterPokemonDetail>(`/master/pokemons/${id}`, {
    responseSchema: masterPokemonDetailSchema,
  });
}

export function searchMoves(pokemonId: number, query: string): Promise<MoveSearchResponse> {
  return apiClient.request<MoveSearchResponse>(
    `/master/moves?${queryString({ q: query, pokemon_id: pokemonId })}`,
    {
      responseSchema: moveSearchResponseSchema,
    },
  );
}

export function searchItems(query: string): Promise<ItemSearchResponse> {
  return apiClient.request<ItemSearchResponse>(`/master/items?${queryString({ q: query })}`, {
    responseSchema: itemSearchResponseSchema,
  });
}

export function fetchAbilities(pokemonId: number): Promise<AbilitySearchResponse> {
  return apiClient.request<AbilitySearchResponse>(
    `/master/abilities?${queryString({ pokemon_id: pokemonId })}`,
    {
      responseSchema: abilitySearchResponseSchema,
    },
  );
}
