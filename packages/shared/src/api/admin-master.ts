import { z } from "zod";
import { POKEMON_TYPES } from "../enums";
import { abilityMasterSchema } from "../master/ability";
import { itemMasterSchema } from "../master/item";
import { moveMasterSchema } from "../master/move";
import { pokemonAbilitiesSchema } from "../master/pokemon";

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const masterIdSchema = z.number().int().positive().safe().max(POSTGRES_INTEGER_MAX);
const requiredTextSchema = z.string().trim().min(1, "1文字以上指定してください");
const baseStatSchema = z.number().int().min(1).max(255);
const pokemonTypeSchema = z.enum(POKEMON_TYPES);

export const adminMasterIdParamsSchema = z
  .object({
    id: z.coerce.number().int().positive().safe().max(POSTGRES_INTEGER_MAX),
  })
  .strict();

export type AdminMasterIdParams = z.infer<typeof adminMasterIdParamsSchema>;

const pokemonWriteShape = {
  dexNo: masterIdSchema,
  nameJa: requiredTextSchema,
  nameEn: requiredTextSchema,
  form: requiredTextSchema,
  type1: pokemonTypeSchema,
  type2: pokemonTypeSchema.nullable(),
  baseHp: baseStatSchema,
  baseAtk: baseStatSchema,
  baseDef: baseStatSchema,
  baseSpa: baseStatSchema,
  baseSpd: baseStatSchema,
  baseSpe: baseStatSchema,
  abilities: pokemonAbilitiesSchema,
  isMega: z.boolean(),
  basePokemonId: masterIdSchema.nullable(),
} as const;

function refinePokemon(
  pokemon: { type1: string; type2: string | null; isMega: boolean; basePokemonId: number | null },
  context: z.RefinementCtx,
): void {
  if (pokemon.type2 === pokemon.type1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "複合タイプに同じタイプは指定できません",
      path: ["type2"],
    });
  }
  if (pokemon.isMega && pokemon.basePokemonId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "メガ形態には元ポケモンが必要です",
      path: ["basePokemonId"],
    });
  }
}

export const adminPokemonWriteSchema = z
  .object(pokemonWriteShape)
  .strict()
  .superRefine(refinePokemon);

export type AdminPokemonWrite = z.infer<typeof adminPokemonWriteSchema>;

export const adminPokemonSchema = z
  .object({ id: masterIdSchema, ...pokemonWriteShape })
  .strict()
  .superRefine(refinePokemon);

export type AdminPokemon = z.infer<typeof adminPokemonSchema>;

export const adminPokemonListResponseSchema = z
  .object({ items: z.array(adminPokemonSchema) })
  .strict();

export type AdminPokemonListResponse = z.infer<typeof adminPokemonListResponseSchema>;

function refineMove(
  move: { category: string; power: number | null },
  context: z.RefinementCtx,
): void {
  if (move.category === "status" && move.power !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "変化技の威力はnullにしてください",
      path: ["power"],
    });
  }
}

const adminMoveBaseSchema = moveMasterSchema.extend({ type: pokemonTypeSchema });

export const adminMoveWriteSchema = adminMoveBaseSchema.strict().superRefine(refineMove);

export type AdminMoveWrite = z.infer<typeof adminMoveWriteSchema>;

export const adminMoveSchema = adminMoveBaseSchema
  .extend({ id: masterIdSchema })
  .strict()
  .superRefine(refineMove);

export type AdminMove = z.infer<typeof adminMoveSchema>;

export const adminMoveListResponseSchema = z.object({ items: z.array(adminMoveSchema) }).strict();

export type AdminMoveListResponse = z.infer<typeof adminMoveListResponseSchema>;

export const adminItemWriteSchema = itemMasterSchema.strict();
export type AdminItemWrite = z.infer<typeof adminItemWriteSchema>;

export const adminItemSchema = itemMasterSchema.extend({ id: masterIdSchema }).strict();
export type AdminItem = z.infer<typeof adminItemSchema>;

export const adminItemListResponseSchema = z.object({ items: z.array(adminItemSchema) }).strict();
export type AdminItemListResponse = z.infer<typeof adminItemListResponseSchema>;

export const adminAbilityWriteSchema = abilityMasterSchema.strict();
export type AdminAbilityWrite = z.infer<typeof adminAbilityWriteSchema>;

export const adminAbilitySchema = abilityMasterSchema.extend({ id: masterIdSchema }).strict();
export type AdminAbility = z.infer<typeof adminAbilitySchema>;

export const adminAbilityListResponseSchema = z
  .object({ items: z.array(adminAbilitySchema) })
  .strict();
export type AdminAbilityListResponse = z.infer<typeof adminAbilityListResponseSchema>;

const uniqueMoveIdsSchema = z.array(masterIdSchema).superRefine((moveIds, context) => {
  if (new Set(moveIds).size !== moveIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "技IDは重複できません",
      path: ["moveIds"],
    });
  }
});

export const adminPokemonMovesWriteSchema = z.object({ moveIds: uniqueMoveIdsSchema }).strict();
export type AdminPokemonMovesWrite = z.infer<typeof adminPokemonMovesWriteSchema>;

export const adminPokemonMovesResponseSchema = z
  .object({
    pokemonId: masterIdSchema,
    moveIds: uniqueMoveIdsSchema,
  })
  .strict();

export type AdminPokemonMovesResponse = z.infer<typeof adminPokemonMovesResponseSchema>;
