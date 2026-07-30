import type { ArchetypeEvs, CompleteArchetypeIvs } from "./archetype";
import type { CombatActualStats } from "./combat-stats";

export type BattleStatKey = "atk" | "def" | "spa" | "spd" | "spe";

export interface PokemonBaseStats {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialAttack: number;
  readonly specialDefense: number;
  readonly speed: number;
}

interface NatureModifier {
  readonly increased: BattleStatKey | null;
  readonly decreased: BattleStatKey | null;
}

/** 日本語の正式な性格名と能力補正。未知の文字列を補正なしとして扱わない。 */
export const POKEMON_NATURE_MODIFIERS = {
  がんばりや: { increased: null, decreased: null },
  さみしがり: { increased: "atk", decreased: "def" },
  ゆうかん: { increased: "atk", decreased: "spe" },
  いじっぱり: { increased: "atk", decreased: "spa" },
  やんちゃ: { increased: "atk", decreased: "spd" },
  ずぶとい: { increased: "def", decreased: "atk" },
  すなお: { increased: null, decreased: null },
  のんき: { increased: "def", decreased: "spe" },
  わんぱく: { increased: "def", decreased: "spa" },
  のうてんき: { increased: "def", decreased: "spd" },
  おくびょう: { increased: "spe", decreased: "atk" },
  せっかち: { increased: "spe", decreased: "def" },
  まじめ: { increased: null, decreased: null },
  ようき: { increased: "spe", decreased: "spa" },
  むじゃき: { increased: "spe", decreased: "spd" },
  ひかえめ: { increased: "spa", decreased: "atk" },
  おっとり: { increased: "spa", decreased: "def" },
  れいせい: { increased: "spa", decreased: "spe" },
  てれや: { increased: null, decreased: null },
  うっかりや: { increased: "spa", decreased: "spd" },
  おだやか: { increased: "spd", decreased: "atk" },
  おとなしい: { increased: "spd", decreased: "def" },
  なまいき: { increased: "spd", decreased: "spe" },
  しんちょう: { increased: "spd", decreased: "spa" },
  きまぐれ: { increased: null, decreased: null },
} as const satisfies Readonly<Record<string, NatureModifier>>;

function assertBaseStat(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 255) {
    throw new RangeError(`${path} must be an integer between 1 and 255`);
  }
}

function natureMultiplier(nature: NatureModifier, stat: BattleStatKey): number {
  if (nature.increased === stat) return 1.1;
  if (nature.decreased === stat) return 0.9;
  return 1;
}

/**
 * 明示された種族値・IV・EV・性格・レベルだけから実数値を算出する。
 * 欠損値や既定IVを補完せず、未知の性格は拒否する。
 */
export function calculatePokemonActualStats(input: {
  readonly baseStats: PokemonBaseStats;
  readonly evs: ArchetypeEvs;
  readonly ivs: CompleteArchetypeIvs;
  readonly level: number;
  readonly nature: string;
}): CombatActualStats {
  if (!Number.isSafeInteger(input.level) || input.level < 1 || input.level > 100) {
    throw new RangeError("level must be an integer between 1 and 100");
  }
  for (const [key, value] of Object.entries(input.baseStats)) {
    assertBaseStat(value, `baseStats.${key}`);
  }

  const nature = POKEMON_NATURE_MODIFIERS[input.nature as keyof typeof POKEMON_NATURE_MODIFIERS];
  if (nature === undefined) {
    throw new RangeError("nature must be a supported Japanese nature name");
  }

  const baseByStat = {
    hp: input.baseStats.hp,
    atk: input.baseStats.attack,
    def: input.baseStats.defense,
    spa: input.baseStats.specialAttack,
    spd: input.baseStats.specialDefense,
    spe: input.baseStats.speed,
  } as const;
  const beforeNature = (stat: BattleStatKey) =>
    Math.floor(
      ((2 * baseByStat[stat] + input.ivs[stat] + Math.floor(input.evs[stat] / 4)) * input.level) /
        100,
    ) + 5;

  return {
    hp:
      Math.floor(
        ((2 * baseByStat.hp + input.ivs.hp + Math.floor(input.evs.hp / 4)) * input.level) / 100,
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
