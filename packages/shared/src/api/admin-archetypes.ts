import { z } from "zod";
import {
  ARCHETYPE_TEAM_SIZE_MAX,
  archetypeDefaultLeadsSchema,
  archetypeEvsSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
  archetypeStatusSchema,
} from "../archetype";

const positiveMasterIdSchema = z.number().int().positive();
const requiredTextSchema = z.string().trim().min(1);
const nullableTextSchema = requiredTextSchema.nullable();
const rateSchema = z.number().min(0).max(1);

export const adminArchetypeIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type AdminArchetypeIdParams = z.infer<typeof adminArchetypeIdParamsSchema>;

export const adminArchetypeMoveInputSchema = z
  .object({
    moveId: positiveMasterIdSchema,
    adoptionRate: rateSchema.default(1),
  })
  .strict();

export const adminArchetypePokemonInputSchema = z
  .object({
    slot: z.number().int().min(1).max(ARCHETYPE_TEAM_SIZE_MAX),
    pokemonId: positiveMasterIdSchema,
    itemId: positiveMasterIdSchema.nullable().default(null),
    itemAlternatives: archetypeItemAlternativeIdsSchema.default([]),
    abilityId: positiveMasterIdSchema.nullable().default(null),
    nature: nullableTextSchema.default(null),
    teraType: nullableTextSchema.default(null),
    evs: archetypeEvsSchema.nullable().default(null),
    role: archetypePokemonRoleSchema,
    usageRate: rateSchema.default(1),
    threatNotes: nullableTextSchema.default(null),
    moves: z.array(adminArchetypeMoveInputSchema).min(1, "技を1件以上指定してください"),
  })
  .strict()
  .superRefine((pokemon, context) => {
    if (
      pokemon.itemId !== null &&
      pokemon.itemAlternatives.some((itemId) => itemId === pokemon.itemId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "定番持ち物を代替持ち物へ重複指定できません",
        path: ["itemAlternatives"],
      });
    }

    const moveIds = pokemon.moves.map((move) => move.moveId);
    if (new Set(moveIds).size !== moveIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "同じポケモンへ同じ技を重複指定できません",
        path: ["moves"],
      });
    }
  });

export const adminArchetypeSourceInputSchema = z
  .object({
    title: requiredTextSchema,
    url: z
      .string()
      .trim()
      .url("出典URLは有効なURLで指定してください")
      .max(2048)
      .refine((url) => /^https?:\/\//iu.test(url), "出典URLはhttpまたはhttpsで指定してください"),
    siteName: requiredTextSchema,
    siteRank: z.number().int().positive().nullable().default(null),
  })
  .strict();

export const adminArchetypeWriteSchema = z
  .object({
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    defaultLeads: archetypeDefaultLeadsSchema,
    playstyleNotes: requiredTextSchema,
    status: archetypeStatusSchema.default("published"),
    pokemons: z
      .array(adminArchetypePokemonInputSchema)
      .min(1, "採用ポケモンを1体以上指定してください")
      .max(ARCHETYPE_TEAM_SIZE_MAX),
    sources: z.array(adminArchetypeSourceInputSchema).min(1, "出典URLを1件以上指定してください"),
  })
  .strict()
  .superRefine((archetype, context) => {
    const slots = archetype.pokemons.map((pokemon) => pokemon.slot);
    if (new Set(slots).size !== slots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のslotは重複できません",
        path: ["pokemons"],
      });
    }

    const pokemonIds = archetype.pokemons.map((pokemon) => pokemon.pokemonId);
    if (new Set(pokemonIds).size !== pokemonIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のポケモンは重複できません",
        path: ["pokemons"],
      });
    }

    const slotSet = new Set(slots);
    for (const [index, leadSlot] of archetype.defaultLeads.entries()) {
      if (!slotSet.has(leadSlot)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "基本選出には構築内に存在するslotを指定してください",
          path: ["defaultLeads", index],
        });
      }
    }

    const sourceUrls = archetype.sources.map((source) => source.url);
    if (new Set(sourceUrls).size !== sourceUrls.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "同じ出典URLは重複できません",
        path: ["sources"],
      });
    }
  });

export type AdminArchetypeWrite = z.infer<typeof adminArchetypeWriteSchema>;
export type AdminArchetypePokemonInput = z.infer<typeof adminArchetypePokemonInputSchema>;

const timestampSchema = z.string().datetime({ offset: true });

export const adminArchetypeMoveSchema = adminArchetypeMoveInputSchema;
export const adminArchetypePokemonSchema = adminArchetypePokemonInputSchema;
export const adminArchetypeSourceSchema = adminArchetypeSourceInputSchema;

export const adminArchetypeDetailSchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    popularityTier: archetypePopularityTierSchema,
    popularityScore: z.number().min(0).max(100).nullable(),
    encounterCount: z.number().int().nonnegative(),
    pickCount: z.number().int().nonnegative(),
    defaultLeads: archetypeDefaultLeadsSchema,
    playstyleNotes: requiredTextSchema,
    status: archetypeStatusSchema,
    publishedAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    pokemons: z.array(adminArchetypePokemonSchema).max(ARCHETYPE_TEAM_SIZE_MAX),
    sources: z.array(adminArchetypeSourceSchema).min(1),
  })
  .strict();

export type AdminArchetypeDetail = z.infer<typeof adminArchetypeDetailSchema>;

export const adminArchetypeSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    popularityTier: archetypePopularityTierSchema,
    status: archetypeStatusSchema,
    publishedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type AdminArchetypeSummary = z.infer<typeof adminArchetypeSummarySchema>;

export const adminArchetypeListResponseSchema = z
  .object({
    items: z.array(adminArchetypeSummarySchema),
  })
  .strict();

export type AdminArchetypeListResponse = z.infer<typeof adminArchetypeListResponseSchema>;
