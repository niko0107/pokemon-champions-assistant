import { DEFAULT_SCORING_CONFIG } from "./config";
import type {
  ArchetypePokemonSnapshot,
  ArchetypeSnapshot,
  MatchDetail,
  ObservationInput,
  ScoredCandidate,
  ScoringConfig,
} from "./types";

const SCORE_DECIMAL_PLACES = 6;

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("calculated score must be finite");
  }
  return Number(value.toFixed(SCORE_DECIMAL_PLACES));
}

function assertPositiveSafeInteger(
  value: number | undefined,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertUsageRate(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${path} must be a finite number between 0 and 1`);
  }
}

function buildPokemonById(
  pokemons: readonly ArchetypePokemonSnapshot[],
): ReadonlyMap<number, ArchetypePokemonSnapshot> {
  const pokemonById = new Map<number, ArchetypePokemonSnapshot>();

  for (const [index, pokemon] of pokemons.entries()) {
    assertPositiveSafeInteger(pokemon.pokemonId, `archetype.pokemons[${index}].pokemonId`);
    assertUsageRate(pokemon.usageRate, `archetype.pokemons[${index}].usageRate`);

    if (pokemonById.has(pokemon.pokemonId)) {
      throw new RangeError(`archetype.pokemons contains duplicate pokemonId ${pokemon.pokemonId}`);
    }
    pokemonById.set(pokemon.pokemonId, pokemon);
  }

  return pokemonById;
}

/**
 * SCORE-002では同じポケモンの再観測を1件に集約する。
 * 入力順に依存しないよう、同じIDでは最小seqの観測を代表として使う。
 */
interface ActivePokemonObservation {
  seq: number;
  pokemonId: number;
}

function uniqueActivePokemonObservations(
  observations: readonly ObservationInput[],
): ActivePokemonObservation[] {
  const observationByPokemonId = new Map<number, ActivePokemonObservation>();

  for (const [index, observation] of observations.entries()) {
    if (observation.isRevoked || observation.kind !== "pokemon") {
      continue;
    }

    assertPositiveSafeInteger(observation.seq, `observations[${index}].seq`);
    assertPositiveSafeInteger(observation.pokemonId, `observations[${index}].pokemonId`);

    const current = observationByPokemonId.get(observation.pokemonId);
    if (current === undefined || observation.seq < current.seq) {
      observationByPokemonId.set(observation.pokemonId, {
        seq: observation.seq,
        pokemonId: observation.pokemonId,
      });
    }
  }

  return [...observationByPokemonId.values()].sort(
    (left, right) => left.seq - right.seq || left.pokemonId - right.pokemonId,
  );
}

/**
 * 1つのテンプレ構築を観測列に対してスコアリングする(設計書 §7.2・§7.5)。
 *
 * 純粋関数として実装すること: 同じ入力に対して常に同じ出力を返し、副作用を持たない。
 *
 * SCORE-002では未取消のポケモン観測だけを扱う。技等の加点、減点・除外判定、
 * likelyUnseen / threatMoveIds の算出は後続タスクで追加する。
 */
export function scoreArchetype(
  archetype: ArchetypeSnapshot,
  observations: readonly ObservationInput[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredCandidate {
  if (!Number.isFinite(config.pokemonHit) || config.pokemonHit < 0) {
    throw new RangeError("config.pokemonHit must be a finite non-negative number");
  }

  const pokemonById = buildPokemonById(archetype.pokemons);
  const activePokemonObservations = uniqueActivePokemonObservations(observations);

  const details: MatchDetail[] = activePokemonObservations.map((observation) => {
    const pokemonId = observation.pokemonId;
    const archetypePokemon = pokemonById.get(pokemonId);
    const points =
      archetypePokemon === undefined
        ? 0
        : roundScore(config.pokemonHit * archetypePokemon.usageRate);

    return {
      observationSeq: observation.seq,
      kind: "pokemon",
      matched: archetypePokemon !== undefined,
      points,
      pokemonId,
    };
  });

  const maxScore = roundScore(activePokemonObservations.length * config.pokemonHit);
  const accumulatedScore = roundScore(details.reduce((total, detail) => total + detail.points, 0));
  const rawScore = Math.min(maxScore, Math.max(0, accumulatedScore));
  const matchRate =
    maxScore === 0 ? 0 : roundScore(Math.min(1, Math.max(0, rawScore / maxScore)) * 100);

  return {
    archetypeId: archetype.id,
    matchRate,
    rawScore,
    maxScore,
    matched: details,
    excluded: false,
    likelyUnseen: [],
    threatMoveIds: [],
  };
}
