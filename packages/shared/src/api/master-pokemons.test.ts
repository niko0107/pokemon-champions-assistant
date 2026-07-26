import { describe, expect, it } from "vitest";
import {
  POKEMON_SEARCH_MAX_QUERY_LENGTH,
  POKEMON_SEARCH_RESULT_LIMIT,
  masterPokemonDetailSchema,
  masterPokemonIdParamsSchema,
  pokemonSearchQuerySchema,
  pokemonSearchResponseSchema,
  pokemonSummarySchema,
} from "./master-pokemons";

describe("pokemonSearchQuerySchema", () => {
  it("2文字以上の検索語を受理し、前後の空白を除去する", () => {
    expect(pokemonSearchQuerySchema.parse({ q: "ギャラ" })).toEqual({ q: "ギャラ" });
    expect(pokemonSearchQuerySchema.parse({ q: "  gyara  " })).toEqual({ q: "gyara" });
    expect(pokemonSearchQuerySchema.parse({ q: "ab" })).toEqual({ q: "ab" });
  });

  it("q 未指定を拒否する", () => {
    expect(pokemonSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("空文字・空白のみ・1文字を拒否する", () => {
    expect(pokemonSearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    expect(pokemonSearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
    expect(pokemonSearchQuerySchema.safeParse({ q: "ギ" }).success).toBe(false);
    // trim 後に1文字になるケース
    expect(pokemonSearchQuerySchema.safeParse({ q: " ギ " }).success).toBe(false);
  });

  it("最大文字数を超える検索語を拒否する", () => {
    const max = "あ".repeat(POKEMON_SEARCH_MAX_QUERY_LENGTH);
    expect(pokemonSearchQuerySchema.safeParse({ q: max }).success).toBe(true);
    expect(pokemonSearchQuerySchema.safeParse({ q: `${max}あ` }).success).toBe(false);
  });

  it("文字列以外を拒否する", () => {
    expect(pokemonSearchQuerySchema.safeParse({ q: 12 }).success).toBe(false);
    expect(pokemonSearchQuerySchema.safeParse({ q: ["ギャラ"] }).success).toBe(false);
  });
});

describe("pokemonSummarySchema / pokemonSearchResponseSchema", () => {
  const validItem = {
    id: 1,
    dexNo: 130,
    nameJa: "ギャラドス",
    nameEn: "Gyarados",
    form: "normal",
    type1: "water",
    type2: "flying",
    isMega: false,
    basePokemonId: null,
  };

  it("正常な検索結果を受理する(単タイプ・メガ形態含む)", () => {
    expect(pokemonSummarySchema.parse(validItem)).toEqual(validItem);
    const mega = {
      ...validItem,
      id: 4,
      nameJa: "メガギャラドス",
      nameEn: "Mega Gyarados",
      form: "mega",
      type2: "dark",
      isMega: true,
      basePokemonId: 1,
    };
    expect(pokemonSummarySchema.parse(mega)).toEqual(mega);
    expect(pokemonSearchResponseSchema.parse({ items: [validItem, mega] }).items).toHaveLength(2);
  });

  it("0件の場合は空配列を受理する", () => {
    expect(pokemonSearchResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it("上限件数を超えるレスポンスを拒否する", () => {
    const items = Array.from({ length: POKEMON_SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({
      ...validItem,
      id: index + 1,
    }));
    expect(pokemonSearchResponseSchema.safeParse({ items }).success).toBe(false);
  });

  it("余計な詳細フィールド(abilities 等)は除去される", () => {
    const parsed = pokemonSummarySchema.parse({ ...validItem, abilities: ["いかく"], baseHp: 95 });
    expect(parsed).toEqual(validItem);
  });
});

describe("MASTER-011 Pokemon detail schemas", () => {
  const detail = {
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

  it("正のPostgreSQL整数IDを受理する", () => {
    expect(masterPokemonIdParamsSchema.parse({ id: "1" })).toEqual({ id: 1 });
    expect(masterPokemonIdParamsSchema.parse({ id: "2147483647" })).toEqual({
      id: 2_147_483_647,
    });
  });

  it.each(["0", "-1", "1.5", "abc", "2147483648", "9007199254740992"])(
    "不正なID %s を拒否する",
    (id) => {
      expect(masterPokemonIdParamsSchema.safeParse({ id }).success).toBe(false);
    },
  );

  it("通常形態の6種族値を含む詳細を受理する", () => {
    expect(masterPokemonDetailSchema.parse(detail)).toEqual(detail);
  });

  it("type2とbasePokemonIdがnullの詳細を受理する", () => {
    expect(
      masterPokemonDetailSchema.parse({
        ...detail,
        type2: null,
        basePokemonId: null,
      }),
    ).toEqual({
      ...detail,
      type2: null,
      basePokemonId: null,
    });
  });

  it("余分な内部情報を拒否する", () => {
    expect(
      masterPokemonDetailSchema.safeParse({
        ...detail,
        abilities: ["いかく"],
        createdAt: "2026-07-26T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("6種族値の不足・範囲外を拒否する", () => {
    const { baseSpe: _baseSpe, ...missingSpeed } = detail;
    expect(masterPokemonDetailSchema.safeParse(missingSpeed).success).toBe(false);
    expect(masterPokemonDetailSchema.safeParse({ ...detail, baseHp: 0 }).success).toBe(false);
    expect(masterPokemonDetailSchema.safeParse({ ...detail, baseAtk: 256 }).success).toBe(false);
  });
});
