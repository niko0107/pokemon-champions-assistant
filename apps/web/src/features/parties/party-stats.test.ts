import { describe, expect, it } from "vitest";
import type { MasterPokemonDetail } from "@pokemon-champions/shared";
import { calculateActualStats } from "./party-stats";

const gyarados: MasterPokemonDetail = {
  id: 1,
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
};

const zeroEvs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const perfectIvs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

describe("calculateActualStats", () => {
  it("HPとその他能力を指定された端数処理順で計算する", () => {
    expect(
      calculateActualStats({
        pokemon: gyarados,
        evs: zeroEvs,
        ivs: perfectIvs,
        level: 50,
        nature: "まじめ",
      }),
    ).toEqual({
      hp: 170,
      attack: 145,
      defense: 99,
      specialAttack: 80,
      specialDefense: 120,
      speed: 101,
    });
  });

  it("EVのfloorと性格上昇・下降補正を反映する", () => {
    expect(
      calculateActualStats({
        pokemon: gyarados,
        evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 4 },
        ivs: perfectIvs,
        level: 50,
        nature: "いじっぱり",
      }),
    ).toEqual({
      hp: 202,
      attack: 194,
      defense: 99,
      specialAttack: 72,
      specialDefense: 120,
      speed: 102,
    });
  });

  it("レベル1と100の境界を計算できる", () => {
    expect(
      calculateActualStats({
        pokemon: gyarados,
        evs: zeroEvs,
        ivs: perfectIvs,
        level: 1,
        nature: "まじめ",
      }).hp,
    ).toBe(13);
    expect(
      calculateActualStats({
        pokemon: gyarados,
        evs: zeroEvs,
        ivs: perfectIvs,
        level: 100,
        nature: "まじめ",
      }).hp,
    ).toBe(331);
  });

  it.each([0, 1.5, 101])("不正レベル%sを拒否する", (level) => {
    expect(() =>
      calculateActualStats({
        pokemon: gyarados,
        evs: zeroEvs,
        ivs: perfectIvs,
        level,
        nature: "まじめ",
      }),
    ).toThrow(RangeError);
  });
});
