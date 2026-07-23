/**
 * 設計書 §6 データベース設計に対応する列挙値。
 * DB スキーマ(Prisma)・API(zod)・UI で共通利用する。
 */

/** 人気度Tier(archetypes.popularity_tier) */
export const POPULARITY_TIERS = ["high", "mid", "low"] as const;
export type PopularityTier = (typeof POPULARITY_TIERS)[number];

/** テンプレ構築の公開状態(archetypes.status) */
export const ARCHETYPE_STATUSES = ["published", "archived"] as const;
export type ArchetypeStatus = (typeof ARCHETYPE_STATUSES)[number];

/** 観測情報の種別(observations.kind) */
export const OBSERVATION_KINDS = [
  "pokemon",
  "move",
  "item",
  "ability",
  "position",
  "mega",
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** 観測位置(observations.position) */
export const OBSERVATION_POSITIONS = ["lead", "back"] as const;
export type ObservationPosition = (typeof OBSERVATION_POSITIONS)[number];

/** 構築内のポケモンの役割(archetype_pokemons.role) */
export const POKEMON_ROLES = ["lead", "sweeper", "wall", "pivot", "support"] as const;
export type PokemonRole = (typeof POKEMON_ROLES)[number];

/** 技分類(moves.category) */
export const MOVE_CATEGORIES = ["physical", "special", "status"] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

/** 警戒技判定等に使う技タグ(moves.tags) */
export const MOVE_TAGS = ["setup", "hazard", "screen", "pivot", "status", "priority"] as const;
export type MoveTag = (typeof MOVE_TAGS)[number];

/** 対戦結果(battle_sessions.result) */
export const BATTLE_RESULTS = ["win", "lose", "unknown"] as const;
export type BattleResult = (typeof BATTLE_RESULTS)[number];

/** ユーザーロール(users.role) */
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
