import type {
  ArchetypeSnapshot,
  ObservationInput,
  RankedCandidate,
} from "@pokemon-champions/scoring";
import type {
  AdminArchetypePreviewCandidate,
  AdminArchetypePreviewRequest,
} from "@pokemon-champions/shared";

/**
 * ARCHETYPE-005 の純粋関数群(DB / NestJS に依存しない)。
 *
 * 保存前の構築入力を「対戦観測列」へ変換して既存スコアリング(SCORE-001〜007)へ渡し、
 * また完全重複判定用の canonical 表現を決定的に生成する。副作用を持たず、
 * 同じ入力に対して常に同じ結果を返す。入力配列や Snapshot は変更しない。
 */

/** 完全重複判定に使う1ポケモンの正規化表現。内容以外のメタデータは含めない。 */
interface CanonicalPokemon {
  pokemonId: number;
  isMega: boolean;
  itemId: number | null;
  abilityId: number | null;
  /** 代替持ち物は集合として扱い、入力順の差を無視する(昇順)。 */
  itemAlternativeIds: number[];
  /** 技は集合として扱い、入力順の差を無視する(昇順)。 */
  moveIds: number[];
}

/** 完全重複判定に使う構築全体の正規化表現。 */
export interface CanonicalArchetype {
  seasonId: number;
  ruleId: number;
  /** ポケモンは pokemonId 昇順に並べ、配列の入力順の差を無視する。 */
  pokemons: CanonicalPokemon[];
  /** 基本選出は順序付き(先頭が基本先発)。slot ではなく pokemonId 列で比較する。 */
  leadPokemonIds: number[];
}

function sortedUnique(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function buildSlotToPokemonId(
  pokemons: readonly { slot: number; pokemonId: number }[],
): ReadonlyMap<number, number> {
  const slotToPokemonId = new Map<number, number>();
  for (const pokemon of pokemons) {
    slotToPokemonId.set(pokemon.slot, pokemon.pokemonId);
  }
  return slotToPokemonId;
}

function resolveLeadPokemonIds(
  leadSlots: readonly number[],
  slotToPokemonId: ReadonlyMap<number, number>,
): number[] {
  const leadPokemonIds: number[] = [];
  for (const slot of leadSlots) {
    const pokemonId = slotToPokemonId.get(slot);
    if (pokemonId !== undefined) {
      leadPokemonIds.push(pokemonId);
    }
  }
  return leadPokemonIds;
}

function sortCanonicalPokemons(pokemons: CanonicalPokemon[]): CanonicalPokemon[] {
  return pokemons.sort((left, right) => left.pokemonId - right.pokemonId);
}

/** 保存前入力から完全重複判定用の canonical 表現を生成する。 */
export function canonicalizeInput(
  input: AdminArchetypePreviewRequest,
  isMegaByPokemonId: ReadonlyMap<number, boolean>,
): CanonicalArchetype {
  const pokemons = input.pokemons.map<CanonicalPokemon>((pokemon) => ({
    pokemonId: pokemon.pokemonId,
    isMega: isMegaByPokemonId.get(pokemon.pokemonId) ?? false,
    itemId: pokemon.itemId,
    abilityId: pokemon.abilityId,
    itemAlternativeIds: sortedUnique(pokemon.itemAlternatives),
    moveIds: sortedUnique(pokemon.moves.map((move) => move.moveId)),
  }));

  return {
    seasonId: input.seasonId,
    ruleId: input.ruleId,
    pokemons: sortCanonicalPokemons(pokemons),
    leadPokemonIds: resolveLeadPokemonIds(input.defaultLeads, buildSlotToPokemonId(input.pokemons)),
  };
}

/** 既存構築の Snapshot から完全重複判定用の canonical 表現を生成する。 */
export function canonicalizeSnapshot(
  snapshot: ArchetypeSnapshot,
  seasonId: number,
  ruleId: number,
): CanonicalArchetype {
  const pokemons = snapshot.pokemons.map<CanonicalPokemon>((pokemon) => ({
    pokemonId: pokemon.pokemonId,
    isMega: pokemon.isMega,
    itemId: pokemon.itemId ?? null,
    abilityId: pokemon.abilityId ?? null,
    itemAlternativeIds: sortedUnique(pokemon.itemAlternativeIds),
    moveIds: sortedUnique(pokemon.moves.map((move) => move.moveId)),
  }));

  return {
    seasonId,
    ruleId,
    pokemons: sortCanonicalPokemons(pokemons),
    leadPokemonIds: resolveLeadPokemonIds(
      snapshot.defaultLeadSlots,
      buildSlotToPokemonId(snapshot.pokemons),
    ),
  };
}

/** canonical 表現の決定的なキー文字列。深い等価比較に使う。 */
export function canonicalKey(canonical: CanonicalArchetype): string {
  return JSON.stringify(canonical);
}

/**
 * 保存前入力を既存スコアリングへ渡せる観測列へ変換する。
 *
 * 観測情報として扱うもの:
 *   - kind=pokemon : 採用ポケモン全体
 *   - kind=move    : 各ポケモンの採用技
 *   - kind=item    : 確定持ち物のみ(代替持ち物は観測列に含めない)
 *   - kind=ability : 確定特性
 *   - kind=mega    : Pokemon.isMega が true のポケモン
 *   - kind=position(lead): 基本先発(defaultLeads の先頭)1体のみ
 *
 * scoreArchetype は先頭 lead 以外に得点を与えないため、lead 観測は先頭1件だけを出す
 * (複数出すと max_score を不当に押し上げ一致度が下がる)。seq は決定的に採番する。
 */
export function buildPreviewObservations(
  input: AdminArchetypePreviewRequest,
  isMegaByPokemonId: ReadonlyMap<number, boolean>,
): ObservationInput[] {
  const observations: ObservationInput[] = [];
  let seq = 1;
  const push = (observation: Omit<ObservationInput, "seq" | "isRevoked">): void => {
    observations.push({ seq, isRevoked: false, ...observation });
    seq += 1;
  };

  const pokemonsBySlot = [...input.pokemons].sort((left, right) => left.slot - right.slot);
  for (const pokemon of pokemonsBySlot) {
    push({ kind: "pokemon", pokemonId: pokemon.pokemonId });

    for (const move of [...pokemon.moves].sort((left, right) => left.moveId - right.moveId)) {
      push({ kind: "move", pokemonId: pokemon.pokemonId, moveId: move.moveId });
    }

    if (pokemon.itemId !== null) {
      push({ kind: "item", pokemonId: pokemon.pokemonId, itemId: pokemon.itemId });
    }
    if (pokemon.abilityId !== null) {
      push({ kind: "ability", pokemonId: pokemon.pokemonId, abilityId: pokemon.abilityId });
    }
    if (isMegaByPokemonId.get(pokemon.pokemonId) === true) {
      push({ kind: "mega", pokemonId: pokemon.pokemonId });
    }
  }

  const primaryLeadSlot = input.defaultLeads[0];
  if (primaryLeadSlot !== undefined) {
    const leadPokemonId = buildSlotToPokemonId(input.pokemons).get(primaryLeadSlot);
    if (leadPokemonId !== undefined) {
      push({ kind: "position", pokemonId: leadPokemonId, position: "lead" });
    }
  }

  return observations;
}

/**
 * RankedCandidate を、表示に必要な項目だけを持つ API 候補へ射影する。
 * name / popularityTier は Snapshot から補い、rawScore / maxScore / excluded 等の
 * 内部値は返さない。
 */
export function toPreviewCandidate(
  ranked: RankedCandidate,
  snapshot: ArchetypeSnapshot,
): AdminArchetypePreviewCandidate {
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

/**
 * 完全重複した既存構築のIDを返す。複数一致時は最小IDを決定的に返し、無ければ null。
 */
export function findExactDuplicateId(
  inputKey: string,
  existing: readonly { archetypeId: string; canonicalKey: string }[],
): string | null {
  const matchedIds = existing
    .filter((candidate) => candidate.canonicalKey === inputKey)
    .map((candidate) => candidate.archetypeId)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  return matchedIds[0] ?? null;
}
