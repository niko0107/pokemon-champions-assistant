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

function assertAdoptionRate(value: number, path: string): void {
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

    const moveIds = new Set<number>();
    for (const [moveIndex, move] of pokemon.moves.entries()) {
      const path = `archetype.pokemons[${index}].moves[${moveIndex}]`;
      assertPositiveSafeInteger(move.moveId, `${path}.moveId`);
      assertAdoptionRate(move.adoptionRate, `${path}.adoptionRate`);

      if (moveIds.has(move.moveId)) {
        throw new RangeError(
          `archetype.pokemons[${index}].moves contains duplicate moveId ${move.moveId}`,
        );
      }
      moveIds.add(move.moveId);
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
 * 同じ対象ポケモンから同じ技を複数回観測しても、最小seqの1件だけを評価する。
 * 同じ技でも対象ポケモンが異なる場合は別の観測として扱う。
 */
interface ActiveMoveObservation {
  seq: number;
  pokemonId: number;
  moveId: number;
}

function uniqueActiveMoveObservations(
  observations: readonly ObservationInput[],
): ActiveMoveObservation[] {
  const observationByPokemonAndMove = new Map<string, ActiveMoveObservation>();

  for (const [index, observation] of observations.entries()) {
    if (observation.isRevoked || observation.kind !== "move") {
      continue;
    }

    assertPositiveSafeInteger(observation.seq, `observations[${index}].seq`);
    assertPositiveSafeInteger(observation.pokemonId, `observations[${index}].pokemonId`);
    assertPositiveSafeInteger(observation.moveId, `observations[${index}].moveId`);

    const key = `${observation.pokemonId}:${observation.moveId}`;
    const current = observationByPokemonAndMove.get(key);
    if (current === undefined || observation.seq < current.seq) {
      observationByPokemonAndMove.set(key, {
        seq: observation.seq,
        pokemonId: observation.pokemonId,
        moveId: observation.moveId,
      });
    }
  }

  return [...observationByPokemonAndMove.values()].sort(
    (left, right) =>
      left.seq - right.seq || left.pokemonId - right.pokemonId || left.moveId - right.moveId,
  );
}

const MATCH_DETAIL_KIND_ORDER: Readonly<Record<MatchDetail["kind"], number>> = {
  pokemon: 0,
  move: 1,
  item: 2,
  ability: 3,
  position: 4,
  mega: 5,
};

function compareMatchDetails(left: MatchDetail, right: MatchDetail): number {
  return (
    left.observationSeq - right.observationSeq ||
    MATCH_DETAIL_KIND_ORDER[left.kind] - MATCH_DETAIL_KIND_ORDER[right.kind] ||
    (left.pokemonId ?? 0) - (right.pokemonId ?? 0) ||
    (left.moveId ?? 0) - (right.moveId ?? 0)
  );
}

/**
 * 1つのテンプレ構築を観測列に対してスコアリングする(設計書 §7.2・§7.5)。
 *
 * 純粋関数として実装すること: 同じ入力に対して常に同じ出力を返し、副作用を持たない。
 *
 * SCORE-003では未取消のポケモン観測と技観測を扱う。持ち物等の加点、
 * 減点・除外判定、likelyUnseen / threatMoveIds の算出は後続タスクで追加する。
 */
export function scoreArchetype(
  archetype: ArchetypeSnapshot,
  observations: readonly ObservationInput[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredCandidate {
  if (!Number.isFinite(config.pokemonHit) || config.pokemonHit < 0) {
    throw new RangeError("config.pokemonHit must be a finite non-negative number");
  }
  if (!Number.isFinite(config.moveHit) || config.moveHit < 0) {
    throw new RangeError("config.moveHit must be a finite non-negative number");
  }

  const pokemonById = buildPokemonById(archetype.pokemons);
  const activePokemonObservations = uniqueActivePokemonObservations(observations);
  const activeMoveObservations = uniqueActiveMoveObservations(observations);

  const pokemonDetails: MatchDetail[] = activePokemonObservations.map((observation) => {
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

  const moveDetails: MatchDetail[] = activeMoveObservations.map((observation) => {
    const archetypeMove = pokemonById
      .get(observation.pokemonId)
      ?.moves.find((move) => move.moveId === observation.moveId);
    const points =
      archetypeMove === undefined ? 0 : roundScore(config.moveHit * archetypeMove.adoptionRate);

    return {
      observationSeq: observation.seq,
      kind: "move",
      matched: archetypeMove !== undefined,
      points,
      pokemonId: observation.pokemonId,
      moveId: observation.moveId,
    };
  });

  const details = [...pokemonDetails, ...moveDetails].sort(compareMatchDetails);
  const maxScore = roundScore(
    activePokemonObservations.length * config.pokemonHit +
      activeMoveObservations.length * config.moveHit,
  );
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
