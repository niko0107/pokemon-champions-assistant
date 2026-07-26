/**
 * 相性判定エンジンの型定義(設計書 §9)。
 *
 * 重要な設計制約:
 *   - UI / API / DB に依存しない純粋なドメインロジックとする
 *   - 入力は「自パーティ」と「予測構築(観測で補正済み)」のスナップショット
 *   - 副作用(I/O・時刻取得・乱数)を持たない
 */
import type {
  BaseTypeEffectivenessMultiplier,
  MoveCategory,
  MoveTag,
  PokemonRole,
  PokemonType,
} from "@pokemon-champions/shared";

/** sharedの現行18タイプ許可値。 */
export type TypeName = PokemonType;

/** 単一・複合タイプの計算結果として取り得る倍率。 */
export type TypeEffectivenessMultiplier = BaseTypeEffectivenessMultiplier | 0.25 | 4;

/** Pokemonの単一・複合タイプ構成。DBと同様に同一タイプの重複は許可しない。 */
export interface DefensiveTyping {
  readonly type1: TypeName;
  readonly type2: TypeName | null;
}

/** 全攻撃タイプから見た防御側の倍率別プロフィール。 */
export interface DefensiveTypeProfile {
  quadrupleWeaknesses: TypeName[];
  weaknesses: TypeName[];
  neutral: TypeName[];
  resistances: TypeName[];
  quarterResistances: TypeName[];
  immunities: TypeName[];
}

/** 1つの攻撃タイプから見た全単一防御タイプのプロフィール。 */
export interface OffensiveTypeProfile {
  superEffective: TypeName[];
  neutral: TypeName[];
  notVeryEffective: TypeName[];
  noEffect: TypeName[];
}

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

/** MATCHUP-003の簡易ダメージ計算に必要な攻撃側情報。 */
export interface DamageAttackerSnapshot extends DefensiveTyping {
  readonly pokemonId: number;
  readonly level: number;
  readonly attack: number;
  readonly specialAttack: number;
}

/** MATCHUP-003の簡易ダメージ計算に必要な防御側情報。 */
export interface DamageDefenderSnapshot extends DefensiveTyping {
  readonly pokemonId: number;
  readonly hp: number;
  readonly defense: number;
  readonly specialDefense: number;
}

/** 既存MoveSnapshotから、簡易ダメージ計算で参照する項目だけを受け取る。 */
export type DamageMoveSnapshot = Readonly<
  Pick<MoveSnapshot, "moveId" | "type" | "category" | "power">
>;

/** MATCHUP-003の簡易ダメージ計算入力。 */
export interface DamageCalculationInput {
  readonly attacker: DamageAttackerSnapshot;
  readonly defender: DamageDefenderSnapshot;
  readonly move: DamageMoveSnapshot;
}

/** PRODUCT_SPEC §9.3のタイプ一致補正。 */
export type StabMultiplier = 1 | 1.5;

/**
 * ダメージ範囲から得られる確定数の分類。
 * 現行仕様は乱数なしだが、範囲入力時も境界を失わない構造にする。
 */
export type KnockoutClassification =
  | "guaranteed_one_hit"
  | "possible_one_hit"
  | "guaranteed_two_hit"
  | "possible_two_hit"
  | "guaranteed_three_plus_hits"
  | "possible_three_plus_hits"
  | "cannot_ko";

/** 確定数だけを独立して算出する入力。 */
export interface KnockoutCountInput {
  readonly defenderHp: number;
  readonly minDamage: number;
  readonly maxDamage: number;
}

/** 下限ダメージによる保証回数と、上限ダメージによる最短回数。 */
export interface KnockoutCountResult {
  /** PRODUCT_SPEC §9.3のceil(HP / damage下限)。倒せない場合はnull。 */
  readonly knockoutCount: number | null;
  /** 上限ダメージを引いた場合の最短回数。倒せない場合はnull。 */
  readonly possibleKnockoutCount: number | null;
  readonly knockoutClassification: KnockoutClassification;
}

/** 簡易ダメージ計算結果。表示文ではなく後続ロジック向けの構造化データ。 */
export interface DamageRangeResult extends KnockoutCountResult {
  readonly moveId: number;
  readonly category: MoveCategory;
  readonly minDamage: number;
  readonly maxDamage: number;
  readonly minDamagePercent: number;
  readonly maxDamagePercent: number;
  readonly typeMultiplier: TypeEffectivenessMultiplier;
  readonly stabMultiplier: StabMultiplier;
  readonly attackerStat: number | null;
  readonly defenderStat: number | null;
  readonly canDamage: boolean;
  readonly isImmune: boolean;
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
  "favorable" | "slightly_favorable" | "even" | "slightly_unfavorable" | "unfavorable";

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
