import { describe, expect, it } from "vitest";
import {
  PARTY_MOVE_COUNT_MAX,
  PARTY_TEAM_SIZE_MAX,
  partyActualStatsSchema,
  partyEvsSchema,
  partyIvsSchema,
  partySchema,
  partyStatPointsSchema,
} from "./party";
import { archetypeStatPointsSchema } from "./archetype";

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
const defaultStatPoints = {
  hp: 32,
  attack: 0,
  defense: 0,
  specialAttack: 32,
  specialDefense: 2,
  speed: 0,
};

const pokemon = {
  slot: 1,
  pokemonId: 10,
  itemId: 20,
  abilityId: 30,
  nature: " わんぱく ",
  teraType: " みず ",
  evs: defaultEvs,
  statPoints: defaultStatPoints,
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
      statPoints: null,
    });
  });

  it("Archetypeと同じ能力ポイントschemaを再利用し、EV・IVへ変換しない", () => {
    expect(partyStatPointsSchema).toBe(archetypeStatPointsSchema);
    const parsed = partySchema.parse({
      name: "Champions",
      ruleId: 1,
      pokemons: [{ ...pokemon, evs: null, ivs: null, statPoints: defaultStatPoints }],
    });

    expect(parsed.pokemons[0]?.statPoints).toEqual(defaultStatPoints);
    expect(parsed.pokemons[0]?.evs).toBeNull();
    expect(parsed.pokemons[0]?.ivs).toBeNull();
  });

  it.each([
    ["33", { ...defaultStatPoints, hp: 33 }],
    ["負数", { ...defaultStatPoints, hp: -1 }],
    ["小数", { ...defaultStatPoints, hp: 0.5 }],
    ["NaN", { ...defaultStatPoints, hp: Number.NaN }],
    ["Infinity", { ...defaultStatPoints, hp: Number.POSITIVE_INFINITY }],
    ["合計67", { ...defaultStatPoints, defense: 1 }],
    [
      "キー不足",
      {
        hp: 32,
        attack: 0,
        defense: 0,
        specialAttack: 32,
        specialDefense: 2,
      },
    ],
    ["余分なキー", { ...defaultStatPoints, extra: 0 }],
  ])("Party能力ポイントの不正値（%s）を拒否する", (_label, statPoints) => {
    expect(partyStatPointsSchema.safeParse(statPoints).success).toBe(false);
  });

  it("Party能力ポイントは全0・各能力32・nullを受理し、入力を変更しない", () => {
    const allZero = {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    };
    expect(partyStatPointsSchema.parse(allZero)).toEqual(allZero);
    for (const stat of Object.keys(allZero) as Array<keyof typeof allZero>) {
      const input = { ...allZero, [stat]: 32 };
      const before = structuredClone(input);
      expect(partyStatPointsSchema.parse(input)[stat]).toBe(32);
      expect(input).toEqual(before);
    }
    expect(partyStatPointsSchema.nullable().parse(null)).toBeNull();
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
