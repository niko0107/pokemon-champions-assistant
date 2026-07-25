import { Prisma } from "@pokemon-champions/database";
import type {
  ArchetypeSnapshot,
  ObservationInput,
  RankedCandidate,
} from "@pokemon-champions/scoring";
import {
  archetypeDefaultLeadsSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
  moveTagsSchema,
  observationKindSchema,
  observationPositionSchema,
  type BattleCandidate,
} from "@pokemon-champions/shared";

export const candidateObservationSelect = {
  seq: true,
  kind: true,
  pokemonId: true,
  moveId: true,
  itemId: true,
  abilityId: true,
  position: true,
  isRevoked: true,
} satisfies Prisma.ObservationSelect;

export const candidateArchetypeSelect = {
  id: true,
  name: true,
  popularityTier: true,
  popularityScore: true,
  encounterCount: true,
  defaultLeads: true,
  updatedAt: true,
  pokemons: {
    select: {
      slot: true,
      pokemonId: true,
      itemId: true,
      itemAlternatives: true,
      abilityId: true,
      role: true,
      usageRate: true,
      pokemon: { select: { isMega: true } },
      moves: {
        select: {
          moveId: true,
          adoptionRate: true,
          move: { select: { tags: true } },
        },
        orderBy: [{ moveId: "asc" }],
      },
    },
    orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
  },
} satisfies Prisma.ArchetypeSelect;

export type CandidateObservationRecord = Prisma.ObservationGetPayload<{
  select: typeof candidateObservationSelect;
}>;

export type CandidateArchetypeRecord = Prisma.ArchetypeGetPayload<{
  select: typeof candidateArchetypeSelect;
}>;

function assertPositiveSafeInteger(value: number | null, path: string): asserts value is number {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertNull(value: unknown, path: string): void {
  if (value !== null) {
    throw new RangeError(`${path} must be null for this observation kind`);
  }
}

function assertBaseObservation(
  record: CandidateObservationRecord,
): asserts record is CandidateObservationRecord & { pokemonId: number } {
  assertPositiveSafeInteger(record.seq, "observation.seq");
  assertPositiveSafeInteger(record.pokemonId, "observation.pokemonId");
  if (typeof record.isRevoked !== "boolean") {
    throw new RangeError("observation.isRevoked must be a boolean");
  }
}

/**
 * PrismaのnullableなObservation行を、kind別の必須・禁止フィールドを確認して
 * scoringのdiscriminatedな入力へ変換する。不正な永続状態は推測で補完しない。
 */
export function toObservationInput(record: CandidateObservationRecord): ObservationInput {
  assertBaseObservation(record);
  const kind = observationKindSchema.parse(record.kind);

  switch (kind) {
    case "pokemon":
      assertNull(record.moveId, "observation.moveId");
      assertNull(record.itemId, "observation.itemId");
      assertNull(record.abilityId, "observation.abilityId");
      assertNull(record.position, "observation.position");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        isRevoked: record.isRevoked,
      };
    case "move": {
      const moveId = record.moveId;
      assertPositiveSafeInteger(moveId, "observation.moveId");
      assertNull(record.itemId, "observation.itemId");
      assertNull(record.abilityId, "observation.abilityId");
      assertNull(record.position, "observation.position");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        moveId,
        isRevoked: record.isRevoked,
      };
    }
    case "item": {
      const itemId = record.itemId;
      assertNull(record.moveId, "observation.moveId");
      assertPositiveSafeInteger(itemId, "observation.itemId");
      assertNull(record.abilityId, "observation.abilityId");
      assertNull(record.position, "observation.position");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        itemId,
        isRevoked: record.isRevoked,
      };
    }
    case "ability": {
      const abilityId = record.abilityId;
      assertNull(record.moveId, "observation.moveId");
      assertNull(record.itemId, "observation.itemId");
      assertPositiveSafeInteger(abilityId, "observation.abilityId");
      assertNull(record.position, "observation.position");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        abilityId,
        isRevoked: record.isRevoked,
      };
    }
    case "position":
      assertNull(record.moveId, "observation.moveId");
      assertNull(record.itemId, "observation.itemId");
      assertNull(record.abilityId, "observation.abilityId");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        position: observationPositionSchema.parse(record.position),
        isRevoked: record.isRevoked,
      };
    case "mega":
      assertNull(record.moveId, "observation.moveId");
      assertNull(record.itemId, "observation.itemId");
      assertNull(record.abilityId, "observation.abilityId");
      assertNull(record.position, "observation.position");
      return {
        seq: record.seq,
        kind,
        pokemonId: record.pokemonId,
        isRevoked: record.isRevoked,
      };
  }
}

/** PrismaのDecimal/JSON/日時を検証済みのscoring Snapshotへ変換する。 */
export function toArchetypeSnapshot(record: CandidateArchetypeRecord): ArchetypeSnapshot {
  if (record.name.trim().length === 0) {
    throw new RangeError(`archetype ${record.id} name must not be empty`);
  }

  const popularityScore = record.popularityScore?.toNumber() ?? null;
  if (
    popularityScore !== null &&
    (!Number.isFinite(popularityScore) || popularityScore < 0 || popularityScore > 100)
  ) {
    throw new RangeError(`archetype ${record.id} popularityScore must be between 0 and 100`);
  }

  const snapshot: ArchetypeSnapshot = {
    id: record.id,
    name: record.name,
    popularityTier: archetypePopularityTierSchema.parse(record.popularityTier),
    popularityScore,
    encounterCount: record.encounterCount,
    defaultLeadSlots: archetypeDefaultLeadsSchema.parse(record.defaultLeads),
    updatedAt: record.updatedAt.toISOString(),
    pokemons: record.pokemons.map((pokemon) => ({
      slot: pokemon.slot,
      pokemonId: pokemon.pokemonId,
      itemId: pokemon.itemId ?? undefined,
      itemAlternativeIds: archetypeItemAlternativeIdsSchema.parse(pokemon.itemAlternatives),
      abilityId: pokemon.abilityId ?? undefined,
      role: archetypePokemonRoleSchema.parse(pokemon.role),
      usageRate: pokemon.usageRate.toNumber(),
      isMega: pokemon.pokemon.isMega,
      moves: pokemon.moves.map((move) => ({
        moveId: move.moveId,
        adoptionRate: move.adoptionRate.toNumber(),
        tags: moveTagsSchema.parse(move.move.tags),
      })),
    })),
  };

  const pokemonSlots = new Set(snapshot.pokemons.map((pokemon) => pokemon.slot));
  for (const slot of snapshot.defaultLeadSlots) {
    if (!pokemonSlots.has(slot)) {
      throw new RangeError(`archetype ${record.id} defaultLeads contains unknown slot ${slot}`);
    }
  }

  return snapshot;
}

/** scoringの内部値を露出せず、sharedの候補契約へ射影する。 */
export function toBattleCandidate(
  ranked: RankedCandidate,
  snapshot: ArchetypeSnapshot,
): BattleCandidate {
  return {
    archetypeId: ranked.archetypeId,
    name: snapshot.name,
    matchRate: ranked.matchRate,
    rank: ranked.rank,
    popularityTier: snapshot.popularityTier,
    matched: ranked.matched.map((detail) => ({ ...detail })),
    contradictions: ranked.contradictions.map((detail) => ({ ...detail })),
    exclusionCodes: [...ranked.exclusionCodes],
    likelyUnseen: ranked.likelyUnseen.map((entry) => ({ ...entry })),
    threatMoveIds: [...ranked.threatMoveIds],
  };
}
