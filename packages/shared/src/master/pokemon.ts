import { z } from "zod";

const abilityNameSchema = z.string().trim().min(1, "特性名は1文字以上必要です");

/** pokemons.abilities JSONB に保存する特性名リスト。 */
export const pokemonAbilitiesSchema = z
  .array(abilityNameSchema)
  .min(1, "特性を1件以上指定してください")
  .superRefine((abilities, context) => {
    if (new Set(abilities).size !== abilities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "特性名は重複できません",
      });
    }
  });

export type PokemonAbilities = z.infer<typeof pokemonAbilitiesSchema>;
