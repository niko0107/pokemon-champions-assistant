import { z } from "zod";
import {
  PARTY_MOVE_COUNT_MAX,
  PARTY_TEAM_SIZE_MAX,
  partyPokemonSchema,
  partySchema,
} from "../party";

const positiveMasterIdSchema = z.number().int().positive();
const requiredTextSchema = z.string().trim().min(1);
const nullableTextSchema = requiredTextSchema.nullable();
const timestampSchema = z.string().datetime({ offset: true });

export const partyIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type PartyIdParams = z.infer<typeof partyIdParamsSchema>;

/**
 * PARTY-002の作成・PUT全置換入力。
 * ルールごとの人数はDB参照が必要なためServiceで検証し、各ポケモンの技4件はここで保証する。
 */
export const partyWriteSchema = partySchema.superRefine((party, context) => {
  party.pokemons.forEach((pokemon, pokemonIndex) => {
    if (pokemon.moves.length !== PARTY_MOVE_COUNT_MAX) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `技は${PARTY_MOVE_COUNT_MAX}件指定してください`,
        path: ["pokemons", pokemonIndex, "moves"],
      });
    }
  });
});

export type PartyWrite = z.infer<typeof partyWriteSchema>;

export const partyPokemonResponseSchema = partyPokemonSchema;

export const partyDetailSchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: nullableTextSchema,
    ruleId: positiveMasterIdSchema,
    isActive: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    pokemons: z.array(partyPokemonResponseSchema).min(1).max(PARTY_TEAM_SIZE_MAX),
  })
  .strict()
  .superRefine((party, context) => {
    const contentResult = partyWriteSchema.safeParse({
      name: party.name,
      description: party.description,
      ruleId: party.ruleId,
      isActive: party.isActive,
      pokemons: party.pokemons,
    });

    if (!contentResult.success) {
      for (const issue of contentResult.error.issues) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export type PartyDetail = z.infer<typeof partyDetailSchema>;

export const partySummarySchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: nullableTextSchema,
    ruleId: positiveMasterIdSchema,
    isActive: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type PartySummary = z.infer<typeof partySummarySchema>;

export const partyListResponseSchema = z
  .object({
    items: z.array(partySummarySchema),
  })
  .strict();

export type PartyListResponse = z.infer<typeof partyListResponseSchema>;
