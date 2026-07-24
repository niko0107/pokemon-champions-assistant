import { describe, expect, it } from "vitest";
import {
  POKEMON_SEARCH_MAX_QUERY_LENGTH,
  POKEMON_SEARCH_RESULT_LIMIT,
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
