import { z } from "zod";
import {
  POKEMON_SEARCH_MAX_QUERY_LENGTH,
  POKEMON_SEARCH_MIN_QUERY_LENGTH,
  POKEMON_SEARCH_RESULT_LIMIT,
} from "./master-pokemons";

/** MASTER-006と揃えた検索語・返却件数の共通条件。 */
export const MASTER_SEARCH_MIN_QUERY_LENGTH = POKEMON_SEARCH_MIN_QUERY_LENGTH;
export const MASTER_SEARCH_MAX_QUERY_LENGTH = POKEMON_SEARCH_MAX_QUERY_LENGTH;
export const MASTER_SEARCH_RESULT_LIMIT = POKEMON_SEARCH_RESULT_LIMIT;

export const masterSearchTextSchema = z
  .string({ required_error: "検索語 q は必須です" })
  .trim()
  .min(MASTER_SEARCH_MIN_QUERY_LENGTH, `検索語は${MASTER_SEARCH_MIN_QUERY_LENGTH}文字以上必要です`)
  .max(
    MASTER_SEARCH_MAX_QUERY_LENGTH,
    `検索語は${MASTER_SEARCH_MAX_QUERY_LENGTH}文字以下にしてください`,
  );

/** Expressのquery文字列を安全な正の整数へ変換する。 */
export const positiveMasterIdQuerySchema = z
  .string({ required_error: "pokemon_id は必須です" })
  .regex(/^[1-9]\d*$/, "pokemon_id は正の整数で指定してください")
  .transform(Number)
  .refine(Number.isSafeInteger, "pokemon_id は安全な整数で指定してください");
