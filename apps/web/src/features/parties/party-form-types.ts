import type {
  AbilitySummary,
  ItemSummary,
  MoveSummary,
  PartyEvs,
  PartyIvs,
  PokemonSummary,
} from "@pokemon-champions/shared";

export const PARTY_STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type PartyStatKey = (typeof PARTY_STAT_KEYS)[number];

export const PARTY_STAT_LABELS: Readonly<Record<PartyStatKey, string>> = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "素早さ",
};

export const PARTY_COMBAT_STAT_KEYS = {
  hp: "hp",
  atk: "attack",
  def: "defense",
  spa: "specialAttack",
  spd: "specialDefense",
  spe: "speed",
} as const;

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

export const EMPTY_EVS: PartyEvs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const PERFECT_IVS: PartyIvs = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31,
};

export interface PartyPokemonFormState {
  slot: number;
  pokemon: PokemonSummary | null;
  item: ItemSummary | null;
  ability: AbilitySummary | null;
  nature: string;
  teraType: string;
  evs: PartyEvs;
  ivs: PartyIvs;
  actualStatOverrides: Partial<Record<PartyStatKey, number>>;
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
    evs: { ...EMPTY_EVS },
    ivs: { ...PERFECT_IVS },
    actualStatOverrides: {},
    moves: [null, null, null, null],
  };
}
