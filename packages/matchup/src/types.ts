/**
 * 相性判定エンジンの型定義(設計書 §9)。
 *
 * 重要な設計制約:
 *   - UI / API / DB に依存しない純粋なドメインロジックとする
 *   - 入力は「自パーティ」と「予測構築(観測で補正済み)」のスナップショット
 *   - 副作用(I/O・時刻取得・乱数)を持たない
 */
import type { MoveCategory, MoveTag, PokemonRole } from "@pokemon-champions/shared";

/** タイプ名(将来 shared のマスタ定数へ昇格予定) */
export type TypeName = string;

/** 実数値セット */
export interface StatValues {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** 相性計算に使う技情報 */
export interface MoveSnapshot {
  moveId: number;
  type: TypeName;
  category: MoveCategory;
  power: number | null;
  accuracy: number | null;
  priority: number;
  tags: MoveTag[];
  /** テンプレ由来の場合の採用率(観測済みは 1.0) */
  adoptionRate: number;
}

/** 相性計算に使うポケモン情報(自分側・相手側共通) */
export interface CombatantSnapshot {
  pokemonId: number;
  types: TypeName[];
  stats: StatValues;
  abilityId?: number;
  itemId?: number;
  teraType?: TypeName;
  isMega: boolean;
  role: PokemonRole | null;
  moves: MoveSnapshot[];
  /** 相手側のみ: この情報が実測(観測済み)かテンプレ補完か */
  isObserved?: boolean;
}

/** 自パーティ(6体・全情報) */
export interface MyPartySnapshot {
  partyId: string;
  pokemons: CombatantSnapshot[];
}

/** 予測構築(相手6体。観測済みは実測、未観測はテンプレ既定値で補完済み) */
export interface PredictedTeamSnapshot {
  archetypeId: string;
  defaultLeadSlots: number[];
  playstyleNotes?: string;
  pokemons: CombatantSnapshot[];
}

/** 1対1相性スコアの内訳(設計書 §9.2 の評価軸) */
export interface MatchupScoreBreakdown {
  /** 攻撃相性(0〜30) */
  offense: number;
  /** 防御相性(0〜30) */
  defense: number;
  /** 素早さ関係(−10〜+15) */
  speed: number;
  /** ダメージ概算による確定数比較(−15〜+15) */
  damageRace: number;
  /** 先制技(+5) */
  priority: number;
  /** 状態異常耐性(0〜5) */
  statusResist: number;
  /** 積み対応(−10〜+10) */
  setupCounter: number;
}

/** 有利/不利の区分(§9.2 のしきい値に対応) */
export type MatchupVerdict =
  | "favorable"
  | "slightly_favorable"
  | "even"
  | "slightly_unfavorable"
  | "unfavorable";

/** 1対1相性スコア(−100〜+100 に正規化) */
export interface MatchupScore {
  myPokemonId: number;
  opponentPokemonId: number;
  score: number;
  verdict: MatchupVerdict;
  breakdown: MatchupScoreBreakdown;
}

/** 相性マトリクス(自6 × 相手6) */
export interface MatchupMatrix {
  scores: MatchupScore[];
}

/** 相手1体に対するおすすめ(counterplan の perOpponent に対応) */
export interface OpponentRecommendation {
  opponentPokemonId: number;
  recommendations: {
    rank: number;
    myPokemonId: number;
    score: number;
    /** 理由の構造化データ(LLM への入力・テンプレ文生成に使用) */
    reasonCodes: string[];
    cautionMoveIds: number[];
  }[];
  /** 出さない方がよい自ポケモン */
  avoidMyPokemonIds: number[];
}

/** おすすめ選出(§9.4) */
export interface TeamPlan {
  leadPokemonId: number;
  backPokemonId: number;
  acePokemonId: number;
  /** 警戒技・警戒ムーブ(§9.5) */
  watchoutMoveIds: number[];
  /** 基本方針の構造化データ(文章化は LLM 側の責務) */
  strategyCodes: string[];
}

/** 相性判定エンジンの最終出力 */
export interface CounterplanResult {
  matrix: MatchupMatrix;
  perOpponent: OpponentRecommendation[];
  teamPlan: TeamPlan;
}
