import { describe, expect, it } from "vitest";
import {
  partyDetailSchema,
  partyIdParamsSchema,
  partyListResponseSchema,
  partyWriteSchema,
} from "./parties";

const evs = { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 };
const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const moves = [
  { slot: 1, moveId: 101 },
  { slot: 2, moveId: 102 },
  { slot: 3, moveId: 103 },
  { slot: 4, moveId: 104 },
];

const validInput = {
  name: " ランク用 ",
  description: " シングル用 ",
  ruleId: 1,
  isActive: true,
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      abilityId: 30,
      nature: " ようき ",
      teraType: " みず ",
      evs,
      ivs,
      moves,
    },
  ],
} as const;

describe("PARTY-002 shared API schemas", () => {
  it("作成・PUT全置換入力をtrimし、4技と能力値を受理する", () => {
    const parsed = partyWriteSchema.parse(validInput);

    expect(parsed).toMatchObject({
      name: "ランク用",
      description: "シングル用",
      isActive: true,
    });
    expect(parsed.pokemons[0]).toMatchObject({
      nature: "ようき",
      teraType: "みず",
      moves,
      actualStats: null,
    });
  });

  it("4件でない技、不正なEV・IV、子要素重複を拒否する", () => {
    expect(
      partyWriteSchema.safeParse({
        ...validInput,
        pokemons: [{ ...validInput.pokemons[0], moves: moves.slice(0, 3) }],
      }).success,
    ).toBe(false);
    expect(
      partyWriteSchema.safeParse({
        ...validInput,
        pokemons: [{ ...validInput.pokemons[0], evs: { ...evs, spe: 252 } }],
      }).success,
    ).toBe(false);
    expect(
      partyWriteSchema.safeParse({
        ...validInput,
        pokemons: [{ ...validInput.pokemons[0], ivs: { ...ivs, atk: 32 } }],
      }).success,
    ).toBe(false);
    expect(
      partyWriteSchema.safeParse({
        ...validInput,
        pokemons: [validInput.pokemons[0], { ...validInput.pokemons[0], slot: 2 }],
      }).success,
    ).toBe(false);
  });

  it("userIdなど契約外の所有者入力を拒否する", () => {
    expect(
      partyWriteSchema.safeParse({
        ...validInput,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
      }).success,
    ).toBe(false);
  });

  it("UUIDパラメータと内部IDを含まない詳細・一覧レスポンスを検証する", () => {
    const id = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
    const content = partyWriteSchema.parse(validInput);
    const detail = {
      ...content,
      id,
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    };

    expect(partyIdParamsSchema.parse({ id })).toEqual({ id });
    expect(partyIdParamsSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(partyDetailSchema.parse(detail)).toEqual(detail);
    expect(
      partyDetailSchema.safeParse({
        ...detail,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
      }).success,
    ).toBe(false);
    expect(
      partyDetailSchema.safeParse({
        ...detail,
        pokemons: [{ id: "internal-child-id", ...detail.pokemons[0] }],
      }).success,
    ).toBe(false);

    expect(
      partyListResponseSchema.safeParse({
        items: [
          {
            id,
            name: detail.name,
            description: detail.description,
            ruleId: detail.ruleId,
            isActive: detail.isActive,
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
