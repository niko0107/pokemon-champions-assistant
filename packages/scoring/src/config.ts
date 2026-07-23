import type { ScoringConfig } from "./types";

/**
 * 配点の初期値(設計書 §7.2 配点表 / 付録B 設定値一覧)。
 * 運用開始後は設定テーブル経由でチューニングし、この値はフォールバックとして残す。
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  pokemonHit: 10,
  moveHit: 15,
  itemHit: 15,
  itemAlternativeHit: 8,
  abilityHit: 8,
  leadHit: 6,
  megaHit: 12,
  pokemonMiss: 20,
  moveConflict: 12,
  itemConflict: 12,
  abilityConflict: 8,
  megaConflict: 25,
  excludeMissCount: 3,
};
