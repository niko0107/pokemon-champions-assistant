/**
 * 一致度計算エンジンの型定義(設計書 §7)。
 *
 * 重要な設計制約:
 *   - このパッケージは UI / API / DB に依存しない純粋なドメインロジックとする
 *   - 入力はすべて引数で受け取り、副作用(I/O・時刻取得・乱数)を持たない
 *   - DB のエンティティは直接受け取らず、計算に必要な形(Snapshot)に変換して渡す
 */
import type {
  MoveTag,
  ObservationKind,
  ObservationPosition,
  PokemonRole,
  PopularityTier,
} from "@pokemon-champions/shared";

/** 観測情報(observations テーブルの計算用スナップショット) */
export interface ObservationInput {
  /** 入力順(Undo・再現用) */
  seq: number;
  kind: ObservationKind;
  /** 対象ポケモンのマスタID */
  pokemonId?: number;
  moveId?: number;
  itemId?: number;
  abilityId?: number;
  position?: ObservationPosition;
  /** Undo 済みの観測は計算対象外 */
  isRevoked: boolean;
}

/** 構築内の技(archetype_pokemon_moves) */
export interface ArchetypeMoveSnapshot {
  moveId: number;
  /** 採用率(確定枠=1.0、選択枠=0.5 等) */
  adoptionRate: number;
  tags: MoveTag[];
}

/** 構築内のポケモン(archetype_pokemons) */
export interface ArchetypePokemonSnapshot {
  slot: number;
  pokemonId: number;
  itemId?: number;
  /** 代替持ち物のマスタID配列 */
  itemAlternativeIds: number[];
  abilityId?: number;
  role: PokemonRole | null;
  /** この構築内での採用率(0〜1) */
  usageRate: number;
  isMega: boolean;
  moves: ArchetypeMoveSnapshot[];
  threatNotes?: string;
}

/** テンプレ構築(archetypes)の計算用スナップショット */
export interface ArchetypeSnapshot {
  id: string;
  name: string;
  popularityTier: PopularityTier;
  popularityScore?: number;
  encounterCount: number;
  /** 基本選出のスロット番号(先発が先頭) */
  defaultLeadSlots: number[];
  updatedAt: string;
  pokemons: ArchetypePokemonSnapshot[];
}

/** 配点設定(設計書 §7.2 / 付録B。設定でチューニング可能) */
export interface ScoringConfig {
  pokemonHit: number;
  moveHit: number;
  itemHit: number;
  itemAlternativeHit: number;
  abilityHit: number;
  leadHit: number;
  megaHit: number;
  pokemonMiss: number;
  moveConflict: number;
  itemConflict: number;
  abilityConflict: number;
  megaConflict: number;
  /** 候補から除外するポケモン不一致数の閾値 */
  excludeMissCount: number;
}

/** 一致/不一致の内訳1件 */
export interface MatchDetail {
  observationSeq: number;
  kind: ObservationKind;
  matched: boolean;
  /** 加点(不一致の場合は負値) */
  points: number;
  /** UI 表示用ラベル解決のための対象ID */
  pokemonId?: number;
  moveId?: number;
  itemId?: number;
  abilityId?: number;
}

/** 未観測ポケモンの提示(設計書 §7.4「残りの可能性が高いポケモン」) */
export interface LikelyUnseenPokemon {
  pokemonId: number;
  usageRate: number;
}

/** スコアリング結果(1構築分) */
export interface ScoredCandidate {
  archetypeId: string;
  /** 一致度(0〜100) */
  matchRate: number;
  rawScore: number;
  maxScore: number;
  matched: MatchDetail[];
  /** 除外条件(ポケモン不一致3体以上 or メガ矛盾)に該当したか */
  excluded: boolean;
  likelyUnseen: LikelyUnseenPokemon[];
  /** 警戒すべき技のマスタID(設計書 §7.4) */
  threatMoveIds: number[];
}

/** ソート済み候補(§7.3 の ORDER BY 適用後) */
export interface RankedCandidate extends ScoredCandidate {
  rank: number;
}
