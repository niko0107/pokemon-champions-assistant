import { createHash } from "node:crypto";
import type { ArchetypeSnapshot, ObservationInput } from "@pokemon-champions/scoring";

const BATTLE_CANDIDATES_CACHE_KEY_VERSION = "v1";
const BATTLE_CANDIDATES_CACHE_KEY_PREFIX = "battle:candidates";

export interface BattleCandidatesCacheState {
  session: {
    id: string;
    ruleId: number;
    status: string;
    selectedArchetypeId: string | null;
  };
  observations: readonly ObservationInput[];
  archetypes: readonly ArchetypeSnapshot[];
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function normalizeArchetype(snapshot: ArchetypeSnapshot): ArchetypeSnapshot {
  return {
    ...snapshot,
    defaultLeadSlots: [...snapshot.defaultLeadSlots].sort(compareNumbers),
    pokemons: snapshot.pokemons
      .map((pokemon) => ({
        ...pokemon,
        itemAlternativeIds: [...pokemon.itemAlternativeIds].sort(compareNumbers),
        moves: pokemon.moves
          .map((move) => ({
            ...move,
            tags: [...move.tags].sort(),
          }))
          .sort((left, right) => left.moveId - right.moveId),
      }))
      .sort((left, right) => left.slot - right.slot || left.pokemonId - right.pokemonId),
  };
}

/**
 * キャッシュversionへ含める状態を、DBからの配列順に左右されない形へ正規化する。
 * Observationだけはseqが意味上の順序なのでseq順に固定する。
 */
export function normalizeBattleCandidatesCacheState(
  state: BattleCandidatesCacheState,
): BattleCandidatesCacheState {
  return {
    session: { ...state.session },
    observations: [...state.observations]
      .map((observation) => ({ ...observation }))
      .sort((left, right) => left.seq - right.seq),
    archetypes: [...state.archetypes]
      .map(normalizeArchetype)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * 秘密情報を含まない候補状態をSHA-256でversion化する。
 * 暗号用途ではなく、長い状態をRedisキーへ安全に収めるために使用する。
 */
export function buildBattleCandidatesCacheKey(state: BattleCandidatesCacheState): string {
  const normalized = normalizeBattleCandidatesCacheState(state);
  const version = createHash("sha256")
    .update(JSON.stringify(canonicalize(normalized)))
    .digest("hex");

  return `${BATTLE_CANDIDATES_CACHE_KEY_PREFIX}:${BATTLE_CANDIDATES_CACHE_KEY_VERSION}:${state.session.id}:${version}`;
}
