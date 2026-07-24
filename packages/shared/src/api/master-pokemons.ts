import { z } from "zod";

/**
 * GET /api/v1/master/pokemons?q= (ポケモン検索・オートコンプリート用)の API 契約。
 * 検索仕様の判断は docs/DECISIONS.md D-020 を参照。
 */

/** オートコンプリート開始の最小文字数(設計書 §11.2「2文字入力で候補表示」) */
export const POKEMON_SEARCH_MIN_QUERY_LENGTH = 2;

/** 検索語の最大文字数(異常入力の遮断用) */
export const POKEMON_SEARCH_MAX_QUERY_LENGTH = 50;

/** 返却件数の上限(オートコンプリート表示分のみ) */
export const POKEMON_SEARCH_RESULT_LIMIT = 10;

export const pokemonSearchQuerySchema = z.object({
  q: z
    .string({ required_error: "検索語 q は必須です" })
    .trim()
    .min(POKEMON_SEARCH_MIN_QUERY_LENGTH, `検索語は${POKEMON_SEARCH_MIN_QUERY_LENGTH}文字以上必要です`)
    .max(POKEMON_SEARCH_MAX_QUERY_LENGTH, `検索語は${POKEMON_SEARCH_MAX_QUERY_LENGTH}文字以下にしてください`),
});

export type PokemonSearchQuery = z.infer<typeof pokemonSearchQuerySchema>;

/**
 * 検索結果1件。オートコンプリート表示に必要な情報のみ返す
 * (abilities・種族値などの詳細は返さない。詳細はポケモン詳細 API で扱う)。
 */
export const pokemonSummarySchema = z.object({
  id: z.number().int().positive(),
  dexNo: z.number().int().positive(),
  nameJa: z.string().min(1),
  nameEn: z.string().min(1),
  form: z.string().min(1),
  type1: z.string().min(1),
  type2: z.string().min(1).nullable(),
  isMega: z.boolean(),
  /** メガ等の派生形態の元ポケモンID(候補のグルーピング用) */
  basePokemonId: z.number().int().positive().nullable(),
});

export type PokemonSummary = z.infer<typeof pokemonSummarySchema>;

export const pokemonSearchResponseSchema = z.object({
  items: z.array(pokemonSummarySchema).max(POKEMON_SEARCH_RESULT_LIMIT),
});

export type PokemonSearchResponse = z.infer<typeof pokemonSearchResponseSchema>;
