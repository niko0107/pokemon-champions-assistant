import { describe, expect, it } from "vitest";
import {
  adminAbilitySchema,
  adminAbilityWriteSchema,
  adminItemSchema,
  adminItemWriteSchema,
  adminMasterIdParamsSchema,
  adminMoveSchema,
  adminMoveWriteSchema,
  adminPokemonListResponseSchema,
  adminPokemonMovesResponseSchema,
  adminPokemonMovesWriteSchema,
  adminPokemonSchema,
  adminPokemonWriteSchema,
} from "./admin-master";

const pokemon = {
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
  abilities: ["いかく"],
  isMega: false,
  basePokemonId: null,
} as const;

const move = {
  nameJa: "たきのぼり",
  nameEn: "Waterfall",
  type: "water",
  category: "physical",
  power: 80,
  accuracy: 100,
  priority: 0,
  tags: [],
} as const;

describe("admin master API schemas", () => {
  it("Pokemon create/update/response/listをstrictに検証する", () => {
    expect(adminPokemonWriteSchema.parse(pokemon)).toEqual(pokemon);
    expect(adminPokemonSchema.parse({ id: 1, ...pokemon })).toEqual({ id: 1, ...pokemon });
    expect(
      adminPokemonListResponseSchema.parse({ items: [{ id: 1, ...pokemon }] }).items,
    ).toHaveLength(1);
    expect(adminPokemonWriteSchema.safeParse({ ...pokemon, role: "admin" }).success).toBe(false);
    expect(adminPokemonSchema.safeParse({ id: 1, ...pokemon, createdAt: "secret" }).success).toBe(
      false,
    );
  });

  it.each([
    ["dexNo", 0],
    ["dexNo", 1.5],
    ["baseHp", 0],
    ["baseAtk", 256],
    ["baseDef", Number.NaN],
    ["baseSpa", Number.POSITIVE_INFINITY],
  ])("Pokemonの数値境界を拒否する: %s=%s", (key, value) => {
    expect(adminPokemonWriteSchema.safeParse({ ...pokemon, [key]: value }).success).toBe(false);
  });

  it("Pokemonのタイプ・特性・メガ参照を検証する", () => {
    expect(adminPokemonWriteSchema.safeParse({ ...pokemon, type1: "unknown" }).success).toBe(false);
    expect(adminPokemonWriteSchema.safeParse({ ...pokemon, type2: "water" }).success).toBe(false);
    expect(
      adminPokemonWriteSchema.safeParse({ ...pokemon, abilities: ["いかく", "いかく"] }).success,
    ).toBe(false);
    expect(
      adminPokemonWriteSchema.safeParse({ ...pokemon, isMega: true, basePokemonId: null }).success,
    ).toBe(false);
    expect(
      adminPokemonWriteSchema.safeParse({
        ...pokemon,
        nameJa: "",
      }).success,
    ).toBe(false);
  });

  it("Move create/update/responseをenum・nullable・strictで検証する", () => {
    expect(adminMoveWriteSchema.parse(move)).toEqual(move);
    expect(adminMoveSchema.parse({ id: 2, ...move })).toEqual({ id: 2, ...move });
    expect(
      adminMoveWriteSchema.parse({
        ...move,
        category: "status",
        power: null,
        accuracy: null,
        tags: ["setup"],
      }).power,
    ).toBeNull();
    expect(adminMoveWriteSchema.safeParse({ ...move, extra: true }).success).toBe(false);
    expect(adminMoveWriteSchema.safeParse({ ...move, category: "invalid" }).success).toBe(false);
    expect(adminMoveWriteSchema.safeParse({ ...move, type: "invalid" }).success).toBe(false);
    expect(adminMoveWriteSchema.safeParse({ ...move, category: "status" }).success).toBe(false);
    expect(adminMoveWriteSchema.safeParse({ ...move, tags: ["setup", "setup"] }).success).toBe(
      false,
    );
  });

  it.each([
    ["power", 0],
    ["power", 301],
    ["accuracy", 0],
    ["accuracy", 101],
    ["priority", -8],
    ["priority", 6],
    ["priority", 0.5],
    ["power", Number.NaN],
    ["accuracy", Number.POSITIVE_INFINITY],
  ])("Moveの数値境界を拒否する: %s=%s", (key, value) => {
    expect(adminMoveWriteSchema.safeParse({ ...move, [key]: value }).success).toBe(false);
  });

  it("ItemとAbilityのcreate/responseをstrictに検証する", () => {
    const item = {
      nameJa: "オボンのみ",
      nameEn: "Sitrus Berry",
      effectTags: ["berry", "recovery"],
    };
    const ability = {
      nameJa: "いかく",
      nameEn: "Intimidate",
      effectTags: ["stat_control"],
    };
    expect(adminItemWriteSchema.parse(item)).toEqual(item);
    expect(adminItemSchema.parse({ id: 1, ...item })).toEqual({ id: 1, ...item });
    expect(adminAbilityWriteSchema.parse(ability)).toEqual(ability);
    expect(adminAbilitySchema.parse({ id: 1, ...ability })).toEqual({ id: 1, ...ability });
    expect(adminItemWriteSchema.safeParse({ ...item, nameJa: " " }).success).toBe(false);
    expect(adminAbilityWriteSchema.safeParse({ ...ability, effectTags: ["invalid"] }).success).toBe(
      false,
    );
    expect(adminAbilityWriteSchema.safeParse({ ...ability, extra: true }).success).toBe(false);
  });

  it("paramsとPokemonMove全置換契約をstrictに検証する", () => {
    expect(adminMasterIdParamsSchema.parse({ id: "12" })).toEqual({ id: 12 });
    expect(adminMasterIdParamsSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(adminMasterIdParamsSchema.safeParse({ id: "1.5" }).success).toBe(false);
    expect(adminMasterIdParamsSchema.safeParse({ id: "1", role: "admin" }).success).toBe(false);
    expect(adminPokemonMovesWriteSchema.parse({ moveIds: [3, 1] })).toEqual({
      moveIds: [3, 1],
    });
    expect(adminPokemonMovesWriteSchema.safeParse({ moveIds: [1, 1] }).success).toBe(false);
    expect(adminPokemonMovesWriteSchema.safeParse({ moveIds: [Number.NaN] }).success).toBe(false);
    expect(adminPokemonMovesResponseSchema.parse({ pokemonId: 1, moveIds: [1, 2] })).toEqual({
      pokemonId: 1,
      moveIds: [1, 2],
    });
    expect(
      adminPokemonMovesResponseSchema.safeParse({
        pokemonId: 1,
        moveIds: [1],
        cacheKey: "secret",
      }).success,
    ).toBe(false);
  });
});
