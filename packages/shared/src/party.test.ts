import { describe, expect, it } from "vitest";
import {
  PARTY_MOVE_COUNT_MAX,
  PARTY_TEAM_SIZE_MAX,
  partyActualStatsSchema,
  partyEvsSchema,
  partyIvsSchema,
  partySchema,
} from "./party";

const defaultEvs = { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 };
const defaultIvs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const defaultActualStats = {
  hp: 200,
  attack: 120,
  defense: 150,
  specialAttack: 100,
  specialDefense: 130,
  speed: 110,
};

const pokemon = {
  slot: 1,
  pokemonId: 10,
  itemId: 20,
  abilityId: 30,
  nature: " わんぱく ",
  teraType: " みず ",
  evs: defaultEvs,
  ivs: defaultIvs,
  actualStats: defaultActualStats,
  moves: [
    { slot: 1, moveId: 40 },
    { slot: 2, moveId: 41 },
  ],
};

describe("PARTY-001 shared schemas", () => {
  it("パーティ構成をtrimし、省略可能値へ既定値を設定する", () => {
    const parsed = partySchema.parse({
      name: " ランク用 ",
      description: " 対戦用パーティ ",
      ruleId: 1,
      pokemons: [
        pokemon,
        {
          slot: 2,
          pokemonId: 11,
          nature: "おくびょう",
          evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
          moves: [{ slot: 1, moveId: 42 }],
        },
      ],
    });

    expect(parsed).toMatchObject({
      name: "ランク用",
      description: "対戦用パーティ",
      isActive: false,
    });
    expect(parsed.pokemons[0]).toMatchObject({
      nature: "わんぱく",
      teraType: "みず",
    });
    expect(parsed.pokemons[1]).toMatchObject({
      itemId: null,
      abilityId: null,
      teraType: null,
      ivs: null,
      actualStats: null,
    });
  });

  it("努力値は6能力・各252以下・合計510以下だけを受理する", () => {
    expect(partyEvsSchema.parse(defaultEvs)).toEqual(defaultEvs);
    expect(partyEvsSchema.safeParse({ ...defaultEvs, hp: 253 }).success).toBe(false);
    expect(
      partyEvsSchema.safeParse({ hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 }).success,
    ).toBe(false);
    expect(partyEvsSchema.safeParse({ hp: 252 }).success).toBe(false);
  });

  it("個体値と実数値の形状・範囲を検証する", () => {
    expect(partyIvsSchema.parse(defaultIvs)).toEqual(defaultIvs);
    expect(partyIvsSchema.safeParse({ ...defaultIvs, spe: 32 }).success).toBe(false);
    expect(partyIvsSchema.safeParse({ ...defaultIvs, atk: -1 }).success).toBe(false);
    expect(partyActualStatsSchema.parse(defaultActualStats)).toEqual(defaultActualStats);
    expect(partyActualStatsSchema.safeParse({ ...defaultActualStats, hp: 0 }).success).toBe(false);
  });

  it("パーティ人数を1〜6体、1体の技数を1〜4件に制限する", () => {
    expect(
      partySchema.safeParse({
        name: "空",
        ruleId: 1,
        pokemons: [],
      }).success,
    ).toBe(false);

    const sevenPokemons = Array.from({ length: PARTY_TEAM_SIZE_MAX + 1 }, (_, index) => ({
      ...pokemon,
      slot: (index % PARTY_TEAM_SIZE_MAX) + 1,
      pokemonId: index + 1,
    }));
    expect(partySchema.safeParse({ name: "7体", ruleId: 1, pokemons: sevenPokemons }).success).toBe(
      false,
    );

    const fiveMoves = Array.from({ length: PARTY_MOVE_COUNT_MAX + 1 }, (_, index) => ({
      slot: (index % PARTY_MOVE_COUNT_MAX) + 1,
      moveId: index + 1,
    }));
    expect(
      partySchema.safeParse({
        name: "技5件",
        ruleId: 1,
        pokemons: [{ ...pokemon, moves: fiveMoves }],
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      "ポケモンslot",
      {
        pokemons: [pokemon, { ...pokemon, pokemonId: 11 }],
      },
    ],
    [
      "ポケモン",
      {
        pokemons: [pokemon, { ...pokemon, slot: 2 }],
      },
    ],
    [
      "技slot",
      {
        pokemons: [
          {
            ...pokemon,
            moves: [
              { slot: 1, moveId: 40 },
              { slot: 1, moveId: 41 },
            ],
          },
        ],
      },
    ],
    [
      "技",
      {
        pokemons: [
          {
            ...pokemon,
            moves: [
              { slot: 1, moveId: 40 },
              { slot: 2, moveId: 40 },
            ],
          },
        ],
      },
    ],
  ])("%sの重複を拒否する", (_label, override) => {
    expect(
      partySchema.safeParse({
        name: "重複確認",
        ruleId: 1,
        ...override,
      }).success,
    ).toBe(false);
  });

  it("slot範囲、空文字、非整数IDを拒否する", () => {
    expect(
      partySchema.safeParse({
        name: "範囲外",
        ruleId: 1,
        pokemons: [{ ...pokemon, slot: 0 }],
      }).success,
    ).toBe(false);
    expect(
      partySchema.safeParse({
        name: " ",
        ruleId: 1,
        pokemons: [pokemon],
      }).success,
    ).toBe(false);
    expect(
      partySchema.safeParse({
        name: "ID",
        ruleId: 1,
        pokemons: [{ ...pokemon, pokemonId: 1.5 }],
      }).success,
    ).toBe(false);
  });
});
