import type { ArchetypeSnapshot, RankedCandidate, ScoredCandidate } from "./types";

const POPULARITY_TIER_ORDER = {
  high: 0,
  mid: 1,
  low: 2,
} as const satisfies Readonly<Record<ArchetypeSnapshot["popularityTier"], number>>;

const ISO_DATE_TIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

interface SortableCandidate {
  candidate: ScoredCandidate;
  popularityTierOrder: number;
  encounterCount: number;
  updatedAtEpochMilliseconds: number;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumbersDescending(left: number, right: number): number {
  return left === right ? 0 : left > right ? -1 : 1;
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("limit must be a non-negative safe integer");
  }
}

function assertMatchRate(matchRate: number, archetypeId: string): void {
  if (!Number.isFinite(matchRate) || matchRate < 0 || matchRate > 100) {
    throw new RangeError(`candidate ${archetypeId} matchRate must be between 0 and 100`);
  }
}

function getPopularityTierOrder(archetype: ArchetypeSnapshot): number {
  const order = POPULARITY_TIER_ORDER[archetype.popularityTier];
  if (order === undefined) {
    throw new RangeError(`archetype ${archetype.id} popularityTier must be high, mid, or low`);
  }
  return order;
}

function assertEncounterCount(encounterCount: number, archetypeId: string): void {
  if (!Number.isSafeInteger(encounterCount) || encounterCount < 0) {
    throw new RangeError(
      `archetype ${archetypeId} encounterCount must be a non-negative safe integer`,
    );
  }
}

function parseUpdatedAt(updatedAt: string, archetypeId: string): number {
  if (!ISO_DATE_TIME_WITH_OFFSET.test(updatedAt)) {
    throw new RangeError(`archetype ${archetypeId} updatedAt must be an ISO date-time with offset`);
  }

  const epochMilliseconds = Date.parse(updatedAt);
  if (!Number.isFinite(epochMilliseconds)) {
    throw new RangeError(`archetype ${archetypeId} updatedAt must be a valid date-time`);
  }
  return epochMilliseconds;
}

function createSortableCandidate(
  candidate: ScoredCandidate,
  archetypes: ReadonlyMap<string, ArchetypeSnapshot>,
): SortableCandidate {
  if (candidate.archetypeId.length === 0) {
    throw new RangeError("candidate archetypeId must not be empty");
  }
  assertMatchRate(candidate.matchRate, candidate.archetypeId);

  const archetype = archetypes.get(candidate.archetypeId);
  if (archetype === undefined) {
    throw new RangeError(`archetype ${candidate.archetypeId} was not found`);
  }
  if (archetype.id !== candidate.archetypeId) {
    throw new RangeError(
      `archetype map key ${candidate.archetypeId} does not match snapshot id ${archetype.id}`,
    );
  }

  assertEncounterCount(archetype.encounterCount, archetype.id);

  return {
    candidate,
    popularityTierOrder: getPopularityTierOrder(archetype),
    encounterCount: archetype.encounterCount,
    updatedAtEpochMilliseconds: parseUpdatedAt(archetype.updatedAt, archetype.id),
  };
}

function compareSortableCandidates(left: SortableCandidate, right: SortableCandidate): number {
  return (
    compareNumbersDescending(left.candidate.matchRate, right.candidate.matchRate) ||
    left.popularityTierOrder - right.popularityTierOrder ||
    compareNumbersDescending(left.encounterCount, right.encounterCount) ||
    compareNumbersDescending(left.updatedAtEpochMilliseconds, right.updatedAtEpochMilliseconds) ||
    compareStrings(left.candidate.archetypeId, right.candidate.archetypeId)
  );
}

/**
 * スコア済み候補を設計書 §7.3 の優先順位でソートし、上位 N 件を返す。
 *   1. 一致度 DESC → 2. 人気度(high→mid→low)→ 3. 遭遇報告数 DESC → 4. 更新日 DESC
 * excluded な候補は除外する。
 *
 * popularityScore は将来のOPS-001用であり、MVPでは手動tierだけを人気度として使う。
 * 全キー同値の場合はarchetypeId ASCで決定的に並べる。
 */
export function rankCandidates(
  candidates: readonly ScoredCandidate[],
  archetypes: ReadonlyMap<string, ArchetypeSnapshot>,
  limit: number,
): RankedCandidate[] {
  assertLimit(limit);

  const seenArchetypeIds = new Set<string>();
  const activeCandidates: SortableCandidate[] = [];

  for (const candidate of candidates) {
    if (seenArchetypeIds.has(candidate.archetypeId)) {
      throw new RangeError(`candidates contains duplicate archetypeId ${candidate.archetypeId}`);
    }
    seenArchetypeIds.add(candidate.archetypeId);

    if (!candidate.excluded) {
      activeCandidates.push(createSortableCandidate(candidate, archetypes));
    }
  }

  return activeCandidates
    .sort(compareSortableCandidates)
    .slice(0, limit)
    .map(({ candidate }, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}
