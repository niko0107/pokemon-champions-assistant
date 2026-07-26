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

/** MATCHUP-004で扱う1対1評価の入力。レベルは保存Snapshotと分離して明示する。 */
export interface MatchupScoreInput {
  readonly self: CombatantSnapshot;
  readonly selfLevel: number;
  readonly opponent: CombatantSnapshot;
  readonly opponentLevel: number;
}

/** 1対1評価の根拠を後続層へ伝える、表示文に依存しないコード。 */
export type MatchupReasonCode =
  | "BEST_MOVE_SUPER_EFFECTIVE"
  | "BEST_MOVE_RESISTED"
  | "BEST_MOVE_IMMUNE"
  | "RESISTS_THREAT"
  | "IMMUNE_TO_THREAT"
  | "TAKES_SUPER_EFFECTIVE_DAMAGE"
  | "WINS_DAMAGE_RACE"
  | "LOSES_DAMAGE_RACE"
  | "EVEN_DAMAGE_RACE"
  | "NO_DAMAGING_MOVE"
  | "OPPONENT_NO_DAMAGING_MOVE";

/** 1対1相性スコア(−100〜+100 に正規化)。 */
export interface MatchupScore {
  /** MATCHUP-004以降の標準名。 */
  selfPokemonId: number;
  /** MATCHUP-001の既存利用側との互換エイリアス。 */
  myPokemonId: number;
  opponentPokemonId: number;
  offensiveScore: number;
  defensiveScore: number;
  damageRaceScore: number;
  totalScore: number;
  classification: MatchupVerdict;
  bestOffensiveMoveId: number | null;
  mostThreateningMoveId: number | null;
  outgoingDamage: DamageRangeResult | null;
  incomingDamage: DamageRangeResult | null;
  outgoingKnockoutCount: number | null;
  incomingKnockoutCount: number | null;
  offensiveTypeMultiplier: TypeEffectivenessMultiplier | null;
  defensiveTypeMultiplier: TypeEffectivenessMultiplier | null;
  reasonCodes: MatchupReasonCode[];
  /** MATCHUP-001の既存利用側との互換エイリアス。 */
  score: number;
  /** MATCHUP-001の既存利用側との互換エイリアス。 */
  verdict: MatchupVerdict;
  /** 承認済みMATCHUP-004対象外の軸は0で保持する互換内訳。 */
  breakdown: MatchupScoreBreakdown;
}

/** MATCHUP-005でマトリクスへ渡す、レベルを明示した1体分の入力。 */
export interface MatchupMatrixCombatant {
  readonly combatant: CombatantSnapshot;
  readonly level: number;
}

/** 相性マトリクス入力。DB由来のParty / Archetypeは呼び出し側で変換する。 */
export interface MatchupMatrixInput {
  readonly self: readonly MatchupMatrixCombatant[];
  readonly opponents: readonly MatchupMatrixCombatant[];
}

/** 相性マトリクス(行: 自分、列: 相手)。 */
export interface MatchupMatrix {
  readonly selfPokemonIds: readonly number[];
  readonly opponentPokemonIds: readonly number[];
  readonly cells: readonly MatchupScore[];
  /** MATCHUP-001の既存利用側との互換エイリアス。 */
  readonly scores: readonly MatchupScore[];
}

/** 相手1体に対する、自分Pokemon 1体分の順位。 */
export interface RankedOpponentRecommendation {
  readonly rank: number;
  readonly recommendedSelfPokemonId: number;
  /** MATCHUP-001の既存利用側との互換エイリアス。 */
  readonly myPokemonId: number;
  readonly score: number;
  readonly matchupResult: MatchupScore;
  /** 理由の構造化データ(LLM への入力・テンプレ文生成に使用)。 */
  readonly reasonCodes: readonly MatchupReasonCode[];
  /** 警戒技の生成はMATCHUP-007のため、MATCHUP-005では空配列。 */
  readonly cautionMoveIds: readonly number[];
}

/** 相手1体に対するおすすめ(counterplan の perOpponent に対応) */
export interface OpponentRecommendation {
  readonly opponentPokemonId: number;
  readonly recommendations: readonly RankedOpponentRecommendation[];
  /** 出さない方がよい自ポケモン */
  readonly avoidMyPokemonIds: readonly number[];
}

/** MATCHUP-005の出力。Counterplan完成前のマトリクスと相手別順位だけを返す。 */
export interface MatchupMatrixResult {
  readonly matrix: MatchupMatrix;
  /** PRODUCT_SPEC §10.3の名称。 */
  readonly perOpponent: readonly OpponentRecommendation[];
  /** 後続層から意図を読み取りやすくする同一値のエイリアス。 */
  readonly recommendationsByOpponent: readonly OpponentRecommendation[];
}

/** MATCHUP-006の選出提案入力。主軸・基本先発の特定は呼び出し側の責務。 */
export interface SelectionRecommendationInput {
  readonly matrix: MatchupMatrixResult;
  readonly pickSize: number;
  readonly priorityOpponentPokemonIds?: readonly number[];
}

/** 選出した自分Pokemonの、相手1体に対する担当結果。 */
export interface SelectionAssignment {
  readonly opponentPokemonId: number;
  readonly assignedSelfPokemonId: number;
  readonly matchupResult: MatchupScore;
}

/** 重み付けせず辞書式比較する選出組の評価値。 */
export interface SelectionMetrics {
  readonly priorityCoveredCount: number;
  readonly coveredCount: number;
  readonly worstBestScore: number;
  readonly bestScoreSum: number;
  readonly secondBestScoreSum: number;
}

/** 任意のRule.pickSizeを表現できるMATCHUP-006専用出力。 */
export interface SelectionRecommendation {
  readonly selectedPokemonIds: readonly number[];
  readonly leadPokemonId: number | null;
  readonly assignmentsByOpponent: readonly SelectionAssignment[];
  readonly coveredOpponentPokemonIds: readonly number[];
  readonly uncoveredOpponentPokemonIds: readonly number[];
  readonly metrics: SelectionMetrics;
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
