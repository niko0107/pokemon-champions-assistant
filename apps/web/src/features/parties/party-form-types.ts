import type {
  AbilitySummary,
  ItemSummary,
  MoveSummary,
  PartyActualStats,
  PartyStatPoints,
  PokemonSummary,
} from "@pokemon-champions/shared";

export const PARTY_STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
] as const;
export type PartyStatKey = (typeof PARTY_STAT_KEYS)[number];
export type PartyNumericInput = number | "";
export type PartyStatPointInputs = {
  [Stat in keyof PartyStatPoints]: PartyNumericInput;
};
export type PartyActualStatInputs = {
  [Stat in keyof PartyActualStats]: PartyNumericInput;
};

export const PARTY_STAT_LABELS: Readonly<Record<PartyStatKey, string>> = {
  hp: "HP",
  attack: "攻撃",
  defense: "防御",
  specialAttack: "特攻",
  specialDefense: "特防",
  speed: "素早さ",
};

export const TERA_TYPES = [
  "ノーマル",
  "ほのお",
  "みず",
  "でんき",
  "くさ",
  "こおり",
  "かくとう",
  "どく",
  "じめん",
  "ひこう",
  "エスパー",
  "むし",
  "いわ",
  "ゴースト",
  "ドラゴン",
  "あく",
  "はがね",
  "フェアリー",
] as const;

export const EMPTY_STAT_POINTS: PartyStatPoints = {
  hp: 0,
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
};
export const EMPTY_ACTUAL_STATS: PartyActualStatInputs = {
  hp: "",
  attack: "",
  defense: "",
  specialAttack: "",
  specialDefense: "",
  speed: "",
};

export interface PartyPokemonFormState {
  slot: number;
  pokemon: PokemonSummary | null;
  item: ItemSummary | null;
  ability: AbilitySummary | null;
  nature: string;
  teraType: string;
  statPoints: PartyStatPointInputs;
  actualStats: PartyActualStatInputs;
  moves: Array<MoveSummary | null>;
}

export function createEmptyPokemonSlot(slot: number): PartyPokemonFormState {
  return {
    slot,
    pokemon: null,
    item: null,
    ability: null,
    nature: "",
    teraType: "",
    statPoints: { ...EMPTY_STAT_POINTS },
    actualStats: { ...EMPTY_ACTUAL_STATS },
    moves: [null, null, null, null],
  };
}
