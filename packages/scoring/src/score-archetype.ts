import { DEFAULT_SCORING_CONFIG } from "./config";
import type {
  ArchetypePokemonSnapshot,
  ArchetypeSnapshot,
  ContradictionDetail,
  ExclusionCode,
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

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPositiveSafeInteger(
  value: number | undefined,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertOptionalPositiveSafeInteger(value: number | undefined, path: string): void {
  if (value !== undefined) {
    assertPositiveSafeInteger(value, path);
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

interface ArchetypePokemonIndex {
  byId: ReadonlyMap<number, ArchetypePokemonSnapshot>;
  bySlot: ReadonlyMap<number, ArchetypePokemonSnapshot>;
}

function buildPokemonIndex(pokemons: readonly ArchetypePokemonSnapshot[]): ArchetypePokemonIndex {
  const pokemonById = new Map<number, ArchetypePokemonSnapshot>();
  const pokemonBySlot = new Map<number, ArchetypePokemonSnapshot>();

  for (const [index, pokemon] of pokemons.entries()) {
    const path = `archetype.pokemons[${index}]`;
    assertPositiveSafeInteger(pokemon.slot, `${path}.slot`);
    assertPositiveSafeInteger(pokemon.pokemonId, `archetype.pokemons[${index}].pokemonId`);
    assertUsageRate(pokemon.usageRate, `archetype.pokemons[${index}].usageRate`);
    assertOptionalPositiveSafeInteger(pokemon.itemId, `${path}.itemId`);
    assertOptionalPositiveSafeInteger(pokemon.abilityId, `${path}.abilityId`);

    if (typeof pokemon.isMega !== "boolean") {
      throw new RangeError(`${path}.isMega must be a boolean`);
    }

    if (pokemonById.has(pokemon.pokemonId)) {
      throw new RangeError(`archetype.pokemons contains duplicate pokemonId ${pokemon.pokemonId}`);
    }
    if (pokemonBySlot.has(pokemon.slot)) {
      throw new RangeError(`archetype.pokemons contains duplicate slot ${pokemon.slot}`);
    }

    if (!Array.isArray(pokemon.itemAlternativeIds)) {
      throw new RangeError(`${path}.itemAlternativeIds must be an array`);
    }
    const itemAlternativeIds = new Set<number>();
    for (const [itemIndex, itemId] of pokemon.itemAlternativeIds.entries()) {
      assertPositiveSafeInteger(itemId, `${path}.itemAlternativeIds[${itemIndex}]`);
      if (itemAlternativeIds.has(itemId)) {
        throw new RangeError(`${path}.itemAlternativeIds contains duplicate itemId ${itemId}`);
      }
      if (itemId === pokemon.itemId) {
        throw new RangeError(`${path}.itemAlternativeIds contains primary itemId ${itemId}`);
      }
      itemAlternativeIds.add(itemId);
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
    pokemonBySlot.set(pokemon.slot, pokemon);
  }

  return {
    byId: pokemonById,
    bySlot: pokemonBySlot,
  };
}

function getPrimaryLeadPokemonId(
  defaultLeadSlots: readonly number[],
  pokemonBySlot: ReadonlyMap<number, ArchetypePokemonSnapshot>,
): number | undefined {
  if (!Array.isArray(defaultLeadSlots)) {
    throw new RangeError("archetype.defaultLeadSlots must be an array");
  }

  const seenSlots = new Set<number>();

  for (const [index, slot] of defaultLeadSlots.entries()) {
    assertPositiveSafeInteger(slot, `archetype.defaultLeadSlots[${index}]`);
    if (seenSlots.has(slot)) {
      throw new RangeError(`archetype.defaultLeadSlots contains duplicate slot ${slot}`);
    }
    if (!pokemonBySlot.has(slot)) {
      throw new RangeError(`archetype.defaultLeadSlots contains unknown slot ${slot}`);
    }
    seenSlots.add(slot);
  }

  const primaryLeadSlot = defaultLeadSlots[0];
  return primaryLeadSlot === undefined ? undefined : pokemonBySlot.get(primaryLeadSlot)?.pokemonId;
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

type PairObservationKind = "item" | "ability";

interface ActivePairObservation {
  seq: number;
  pokemonId: number;
  targetId: number;
}

function uniqueActivePairObservations(
  observations: readonly ObservationInput[],
  kind: PairObservationKind,
): ActivePairObservation[] {
  const observationByPair = new Map<string, ActivePairObservation>();

  for (const [index, observation] of observations.entries()) {
    if (observation.isRevoked || observation.kind !== kind) {
      continue;
    }

    assertPositiveSafeInteger(observation.seq, `observations[${index}].seq`);
    assertPositiveSafeInteger(observation.pokemonId, `observations[${index}].pokemonId`);
    const targetId = kind === "item" ? observation.itemId : observation.abilityId;
    assertPositiveSafeInteger(targetId, `observations[${index}].${kind}Id`);

    const key = `${observation.pokemonId}:${targetId}`;
    const current = observationByPair.get(key);
    if (current === undefined || observation.seq < current.seq) {
      observationByPair.set(key, {
        seq: observation.seq,
        pokemonId: observation.pokemonId,
        targetId,
      });
    }
  }

  return [...observationByPair.values()].sort(
    (left, right) =>
      left.seq - right.seq || left.pokemonId - right.pokemonId || left.targetId - right.targetId,
  );
}

interface ActiveLeadObservation {
  seq: number;
  pokemonId: number;
}

function uniqueActiveLeadObservations(
  observations: readonly ObservationInput[],
): ActiveLeadObservation[] {
  const observationByPokemonId = new Map<number, ActiveLeadObservation>();

  for (const [index, observation] of observations.entries()) {
    if (observation.isRevoked || observation.kind !== "position") {
      continue;
    }

    assertPositiveSafeInteger(observation.seq, `observations[${index}].seq`);
    assertPositiveSafeInteger(observation.pokemonId, `observations[${index}].pokemonId`);
    if (observation.position !== "lead" && observation.position !== "back") {
      throw new RangeError(`observations[${index}].position must be lead or back`);
    }
    if (observation.position === "back") {
      continue;
    }

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

interface ActiveMegaObservation {
  seq: number;
  pokemonId: number;
}

function uniqueActiveMegaObservations(
  observations: readonly ObservationInput[],
): ActiveMegaObservation[] {
  const observationByPokemonId = new Map<number, ActiveMegaObservation>();

  for (const [index, observation] of observations.entries()) {
    if (observation.isRevoked || observation.kind !== "mega") {
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
    (left.moveId ?? 0) - (right.moveId ?? 0) ||
    (left.itemId ?? 0) - (right.itemId ?? 0) ||
    (left.abilityId ?? 0) - (right.abilityId ?? 0)
  );
}

function compareContradictionDetails(
  left: ContradictionDetail,
  right: ContradictionDetail,
): number {
  return (
    left.observationSeq - right.observationSeq ||
    MATCH_DETAIL_KIND_ORDER[left.kind] - MATCH_DETAIL_KIND_ORDER[right.kind] ||
    (left.pokemonId ?? 0) - (right.pokemonId ?? 0) ||
    (left.moveId ?? 0) - (right.moveId ?? 0) ||
    (left.itemId ?? 0) - (right.itemId ?? 0) ||
    (left.abilityId ?? 0) - (right.abilityId ?? 0) ||
    compareStrings(left.contradictionCode, right.contradictionCode)
  );
}

function assertScoringWeight(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be a finite non-negative number`);
  }
}

/**
 * 1つのテンプレ構築を観測列に対してスコアリングする(設計書 §7.2・§7.5)。
 *
 * 純粋関数として実装すること: 同じ入力に対して常に同じ出力を返し、副作用を持たない。
 *
 * SCORE-004では未取消の全観測を一致加点・矛盾減点へ合成し、
 * PRODUCT_SPEC §7.2の条件で候補を除外する。
 * likelyUnseen / threatMoveIds の算出は後続タスクで追加する。
 */
export function scoreArchetype(
  archetype: ArchetypeSnapshot,
  observations: readonly ObservationInput[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredCandidate {
  assertScoringWeight(config.pokemonHit, "config.pokemonHit");
  assertScoringWeight(config.moveHit, "config.moveHit");
  assertScoringWeight(config.itemHit, "config.itemHit");
  assertScoringWeight(config.itemAlternativeHit, "config.itemAlternativeHit");
  assertScoringWeight(config.abilityHit, "config.abilityHit");
  assertScoringWeight(config.leadHit, "config.leadHit");
  assertScoringWeight(config.megaHit, "config.megaHit");
  assertScoringWeight(config.pokemonMiss, "config.pokemonMiss");
  assertScoringWeight(config.moveConflict, "config.moveConflict");
  assertScoringWeight(config.itemConflict, "config.itemConflict");
  assertScoringWeight(config.abilityConflict, "config.abilityConflict");
  assertScoringWeight(config.megaConflict, "config.megaConflict");
  assertPositiveSafeInteger(config.excludeMissCount, "config.excludeMissCount");

  const pokemonIndex = buildPokemonIndex(archetype.pokemons);
  const primaryLeadPokemonId = getPrimaryLeadPokemonId(
    archetype.defaultLeadSlots,
    pokemonIndex.bySlot,
  );
  const activePokemonObservations = uniqueActivePokemonObservations(observations);
  const activeMoveObservations = uniqueActiveMoveObservations(observations);
  const activeItemObservations = uniqueActivePairObservations(observations, "item");
  const activeAbilityObservations = uniqueActivePairObservations(observations, "ability");
  const activeLeadObservations = uniqueActiveLeadObservations(observations);
  const activeMegaObservations = uniqueActiveMegaObservations(observations);

  const pokemonDetails: MatchDetail[] = activePokemonObservations.map((observation) => {
    const pokemonId = observation.pokemonId;
    const archetypePokemon = pokemonIndex.byId.get(pokemonId);
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
    const archetypeMove = pokemonIndex.byId
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

  const itemDetails: MatchDetail[] = activeItemObservations.map((observation) => {
    const archetypePokemon = pokemonIndex.byId.get(observation.pokemonId);
    const isPrimary = archetypePokemon?.itemId === observation.targetId;
    const isAlternative =
      !isPrimary && archetypePokemon?.itemAlternativeIds.includes(observation.targetId) === true;
    const points = isPrimary ? config.itemHit : isAlternative ? config.itemAlternativeHit : 0;

    return {
      observationSeq: observation.seq,
      kind: "item",
      matched: isPrimary || isAlternative,
      points: roundScore(points),
      pokemonId: observation.pokemonId,
      itemId: observation.targetId,
    };
  });

  const abilityDetails: MatchDetail[] = activeAbilityObservations.map((observation) => {
    const matched =
      pokemonIndex.byId.get(observation.pokemonId)?.abilityId === observation.targetId;

    return {
      observationSeq: observation.seq,
      kind: "ability",
      matched,
      points: matched ? roundScore(config.abilityHit) : 0,
      pokemonId: observation.pokemonId,
      abilityId: observation.targetId,
    };
  });

  const leadDetails: MatchDetail[] = activeLeadObservations.map((observation) => {
    const matched = primaryLeadPokemonId === observation.pokemonId;

    return {
      observationSeq: observation.seq,
      kind: "position",
      matched,
      points: matched ? roundScore(config.leadHit) : 0,
      pokemonId: observation.pokemonId,
      position: "lead",
    };
  });

  const megaDetails: MatchDetail[] = activeMegaObservations.map((observation) => {
    const matched = pokemonIndex.byId.get(observation.pokemonId)?.isMega === true;

    return {
      observationSeq: observation.seq,
      kind: "mega",
      matched,
      points: matched ? roundScore(config.megaHit) : 0,
      pokemonId: observation.pokemonId,
    };
  });

  const details = [
    ...pokemonDetails,
    ...moveDetails,
    ...itemDetails,
    ...abilityDetails,
    ...leadDetails,
    ...megaDetails,
  ].sort(compareMatchDetails);
  const pokemonContradictions: ContradictionDetail[] = activePokemonObservations
    .filter((observation) => !pokemonIndex.byId.has(observation.pokemonId))
    .map((observation) => ({
      observationSeq: observation.seq,
      kind: "pokemon",
      penaltyPoints: roundScore(-config.pokemonMiss),
      contradictionCode: "pokemon_not_in_archetype",
      pokemonId: observation.pokemonId,
    }));
  const moveContradictions: ContradictionDetail[] = activeMoveObservations.flatMap(
    (observation) => {
      const archetypePokemon = pokemonIndex.byId.get(observation.pokemonId);
      if (
        archetypePokemon === undefined ||
        archetypePokemon.moves.some((move) => move.moveId === observation.moveId)
      ) {
        return [];
      }

      return [
        {
          observationSeq: observation.seq,
          kind: "move",
          penaltyPoints: roundScore(-config.moveConflict),
          contradictionCode: "move_not_in_archetype",
          pokemonId: observation.pokemonId,
          moveId: observation.moveId,
        },
      ];
    },
  );
  const itemContradictions: ContradictionDetail[] = activeItemObservations.flatMap(
    (observation) => {
      const archetypePokemon = pokemonIndex.byId.get(observation.pokemonId);
      if (
        archetypePokemon === undefined ||
        archetypePokemon.itemId === observation.targetId ||
        archetypePokemon.itemAlternativeIds.includes(observation.targetId)
      ) {
        return [];
      }

      return [
        {
          observationSeq: observation.seq,
          kind: "item",
          penaltyPoints: roundScore(-config.itemConflict),
          contradictionCode: "item_not_in_archetype",
          pokemonId: observation.pokemonId,
          itemId: observation.targetId,
        },
      ];
    },
  );
  const abilityContradictions: ContradictionDetail[] = activeAbilityObservations.flatMap(
    (observation) => {
      const archetypePokemon = pokemonIndex.byId.get(observation.pokemonId);
      if (
        archetypePokemon === undefined ||
        archetypePokemon.abilityId === undefined ||
        archetypePokemon.abilityId === observation.targetId
      ) {
        return [];
      }

      return [
        {
          observationSeq: observation.seq,
          kind: "ability",
          penaltyPoints: roundScore(-config.abilityConflict),
          contradictionCode: "ability_mismatch",
          pokemonId: observation.pokemonId,
          abilityId: observation.targetId,
        },
      ];
    },
  );
  const megaContradictions: ContradictionDetail[] = activeMegaObservations
    .filter((observation) => pokemonIndex.byId.get(observation.pokemonId)?.isMega !== true)
    .map((observation) => ({
      observationSeq: observation.seq,
      kind: "mega",
      penaltyPoints: roundScore(-config.megaConflict),
      contradictionCode: "mega_not_in_archetype",
      pokemonId: observation.pokemonId,
    }));
  const contradictions = [
    ...pokemonContradictions,
    ...moveContradictions,
    ...itemContradictions,
    ...abilityContradictions,
    ...megaContradictions,
  ].sort(compareContradictionDetails);
  const exclusionCodes: ExclusionCode[] = [];
  if (pokemonContradictions.length >= config.excludeMissCount) {
    exclusionCodes.push("pokemon_miss_threshold");
  }
  if (megaContradictions.length > 0) {
    exclusionCodes.push("mega_conflict");
  }
  const maxScore = roundScore(
    activePokemonObservations.length * config.pokemonHit +
      activeMoveObservations.length * config.moveHit +
      activeItemObservations.length * config.itemHit +
      activeAbilityObservations.length * config.abilityHit +
      activeLeadObservations.length * config.leadHit +
      activeMegaObservations.length * config.megaHit,
  );
  const accumulatedScore = roundScore(
    details.reduce((total, detail) => total + detail.points, 0) +
      contradictions.reduce((total, contradiction) => total + contradiction.penaltyPoints, 0),
  );
  const rawScore = Math.min(maxScore, Math.max(0, accumulatedScore));
  const matchRate =
    maxScore === 0 ? 0 : roundScore(Math.min(1, Math.max(0, rawScore / maxScore)) * 100);

  return {
    archetypeId: archetype.id,
    matchRate,
    rawScore,
    maxScore,
    matched: details,
    contradictions,
    excluded: exclusionCodes.length > 0,
    exclusionCodes,
    likelyUnseen: [],
    threatMoveIds: [],
  };
}
