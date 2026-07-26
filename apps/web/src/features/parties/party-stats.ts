import type {
  MasterPokemonDetail,
  PartyActualStats,
  PartyEvs,
  PartyIvs,
} from "@pokemon-champions/shared";

export type BattleStat = "atk" | "def" | "spa" | "spd" | "spe";
export type PartyStat = "hp" | BattleStat;

export interface NatureOption {
  value: string;
  label: string;
  increased: BattleStat | null;
  decreased: BattleStat | null;
}

export const NATURE_OPTIONS: readonly NatureOption[] = [
  { value: "がんばりや", label: "がんばりや（補正なし）", increased: null, decreased: null },
  { value: "さみしがり", label: "さみしがり（攻撃↑ 防御↓）", increased: "atk", decreased: "def" },
  { value: "ゆうかん", label: "ゆうかん（攻撃↑ 素早さ↓）", increased: "atk", decreased: "spe" },
  {
    value: "いじっぱり",
    label: "いじっぱり（攻撃↑ 特攻↓）",
    increased: "atk",
    decreased: "spa",
  },
  {
    value: "やんちゃ",
    label: "やんちゃ（攻撃↑ 特防↓）",
    increased: "atk",
    decreased: "spd",
  },
  { value: "ずぶとい", label: "ずぶとい（防御↑ 攻撃↓）", increased: "def", decreased: "atk" },
  { value: "すなお", label: "すなお（補正なし）", increased: null, decreased: null },
  { value: "のんき", label: "のんき（防御↑ 素早さ↓）", increased: "def", decreased: "spe" },
  { value: "わんぱく", label: "わんぱく（防御↑ 特攻↓）", increased: "def", decreased: "spa" },
  {
    value: "のうてんき",
    label: "のうてんき（防御↑ 特防↓）",
    increased: "def",
    decreased: "spd",
  },
  { value: "おくびょう", label: "おくびょう（素早さ↑ 攻撃↓）", increased: "spe", decreased: "atk" },
  { value: "せっかち", label: "せっかち（素早さ↑ 防御↓）", increased: "spe", decreased: "def" },
  { value: "まじめ", label: "まじめ（補正なし）", increased: null, decreased: null },
  {
    value: "ようき",
    label: "ようき（素早さ↑ 特攻↓）",
    increased: "spe",
    decreased: "spa",
  },
  {
    value: "むじゃき",
    label: "むじゃき（素早さ↑ 特防↓）",
    increased: "spe",
    decreased: "spd",
  },
  { value: "ひかえめ", label: "ひかえめ（特攻↑ 攻撃↓）", increased: "spa", decreased: "atk" },
  { value: "おっとり", label: "おっとり（特攻↑ 防御↓）", increased: "spa", decreased: "def" },
  { value: "れいせい", label: "れいせい（特攻↑ 素早さ↓）", increased: "spa", decreased: "spe" },
  { value: "てれや", label: "てれや（補正なし）", increased: null, decreased: null },
  {
    value: "うっかりや",
    label: "うっかりや（特攻↑ 特防↓）",
    increased: "spa",
    decreased: "spd",
  },
  { value: "おだやか", label: "おだやか（特防↑ 攻撃↓）", increased: "spd", decreased: "atk" },
  {
    value: "おとなしい",
    label: "おとなしい（特防↑ 防御↓）",
    increased: "spd",
    decreased: "def",
  },
  { value: "なまいき", label: "なまいき（特防↑ 素早さ↓）", increased: "spd", decreased: "spe" },
  {
    value: "しんちょう",
    label: "しんちょう（特防↑ 特攻↓）",
    increased: "spd",
    decreased: "spa",
  },
  { value: "きまぐれ", label: "きまぐれ（補正なし）", increased: null, decreased: null },
] as const;

const baseStatKeys: Readonly<Record<PartyStat, keyof MasterPokemonDetail>> = {
  hp: "baseHp",
  atk: "baseAtk",
  def: "baseDef",
  spa: "baseSpa",
  spd: "baseSpd",
  spe: "baseSpe",
};

function natureMultiplier(nature: NatureOption, stat: BattleStat): number {
  if (nature.increased === stat) {
    return 1.1;
  }
  if (nature.decreased === stat) {
    return 0.9;
  }
  return 1;
}

export function calculateActualStats(input: {
  pokemon: MasterPokemonDetail;
  evs: PartyEvs;
  ivs: PartyIvs;
  level: number;
  nature: string;
}): PartyActualStats {
  const nature = NATURE_OPTIONS.find((option) => option.value === input.nature);
  if (!nature) {
    throw new RangeError("未対応の性格です");
  }
  if (!Number.isSafeInteger(input.level) || input.level < 1 || input.level > 100) {
    throw new RangeError("レベルは1〜100の整数で指定してください");
  }

  const base = (stat: PartyStat) => input.pokemon[baseStatKeys[stat]] as number;
  const beforeNature = (stat: BattleStat) =>
    Math.floor(
      ((2 * base(stat) + input.ivs[stat] + Math.floor(input.evs[stat] / 4)) * input.level) / 100,
    ) + 5;

  return {
    hp:
      Math.floor(
        ((2 * base("hp") + input.ivs.hp + Math.floor(input.evs.hp / 4)) * input.level) / 100,
      ) +
      input.level +
      10,
    attack: Math.floor(beforeNature("atk") * natureMultiplier(nature, "atk")),
    defense: Math.floor(beforeNature("def") * natureMultiplier(nature, "def")),
    specialAttack: Math.floor(beforeNature("spa") * natureMultiplier(nature, "spa")),
    specialDefense: Math.floor(beforeNature("spd") * natureMultiplier(nature, "spd")),
    speed: Math.floor(beforeNature("spe") * natureMultiplier(nature, "spe")),
  };
}
