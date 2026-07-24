import { z } from "zod";

const masterIdSchema = z.number().int().positive();

/** フォルム単位のポケモンと習得可能技の関連入力。 */
export const pokemonMoveSchema = z.object({
  pokemonId: masterIdSchema,
  moveId: masterIdSchema,
});

export type PokemonMoveInput = z.infer<typeof pokemonMoveSchema>;
