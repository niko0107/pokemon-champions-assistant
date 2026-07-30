import { z } from "zod";
import {
  ARCHETYPE_TEAM_SIZE_MAX,
  archetypeDefaultLeadsForPickSizeSchema,
  archetypeDefaultLeadsSchema,
  archetypeEvsSchema,
  archetypeIvsSchema,
  archetypePokemonRoleSchema,
  archetypeSlotSchema,
  archetypeStatDataStatusSchema,
  completeArchetypeIvsSchema,
} from "../archetype";
import { combatActualStatsSchema } from "../combat-stats";
import { POKEMON_TYPES } from "../enums";
import { moveCategorySchema, moveTagsSchema } from "../master/move";

const positiveMasterIdSchema = z.number().int().safe().positive();
const requiredTextSchema = z.string().trim().min(1);
const nullableTextSchema = requiredTextSchema.nullable();
const rateSchema = z.number().finite().min(0).max(1);
const pokemonTypeSchema = z.enum(POKEMON_TYPES);

export const archetypeDetailParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type ArchetypeDetailParams = z.infer<typeof archetypeDetailParamsSchema>;

export const publicArchetypeRuleSchema = z
  .object({
    id: positiveMasterIdSchema,
    name: requiredTextSchema,
    teamSize: z.number().int().safe().min(1).max(ARCHETYPE_TEAM_SIZE_MAX),
    pickSize: z.number().int().safe().positive(),
    battleLevel: z.number().int().safe().min(1).max(100),
  })
  .strict();

export const publicArchetypeSeasonSchema = z
  .object({
    id: positiveMasterIdSchema,
    name: requiredTextSchema,
  })
  .strict();

export const publicArchetypePokemonMasterSchema = z
  .object({
    id: positiveMasterIdSchema,
    nameJa: requiredTextSchema,
    nameEn: requiredTextSchema,
    form: requiredTextSchema,
    type1: pokemonTypeSchema,
    type2: pokemonTypeSchema.nullable(),
    isMega: z.boolean(),
  })
  .strict();

export const publicArchetypeItemSchema = z
  .object({
    id: positiveMasterIdSchema,
    nameJa: requiredTextSchema,
    nameEn: requiredTextSchema,
  })
  .strict();

export const publicArchetypeAbilitySchema = publicArchetypeItemSchema;

export const publicArchetypeMoveSchema = z
  .object({
    moveId: positiveMasterIdSchema,
    nameJa: requiredTextSchema,
    nameEn: requiredTextSchema,
    type: pokemonTypeSchema,
    category: moveCategorySchema,
    power: z.number().int().safe().positive().nullable(),
    accuracy: z.number().int().safe().min(1).max(100).nullable(),
    priority: z.number().int().safe().min(-7).max(5),
    tags: moveTagsSchema,
    adoptionRate: rateSchema,
  })
  .strict();

export const publicArchetypePokemonSchema = z
  .object({
    slot: archetypeSlotSchema,
    usageRate: rateSchema,
    nature: nullableTextSchema,
    teraType: nullableTextSchema,
    evs: archetypeEvsSchema.nullable(),
    ivs: archetypeIvsSchema.nullable(),
    actualStats: combatActualStatsSchema.nullable(),
    statDataStatus: archetypeStatDataStatusSchema,
    role: archetypePokemonRoleSchema,
    threatNotes: nullableTextSchema,
    pokemon: publicArchetypePokemonMasterSchema,
    item: publicArchetypeItemSchema.nullable(),
    ability: publicArchetypeAbilitySchema.nullable(),
    moves: z.array(publicArchetypeMoveSchema),
  })
  .strict()
  .superRefine((pokemon, context) => {
    const moveIds = pokemon.moves.map((move) => move.moveId);
    if (new Set(moveIds).size !== moveIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "同じポケモンの技は重複できません",
        path: ["moves"],
      });
    }

    if (pokemon.statDataStatus === "partial" && pokemon.actualStats !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "partialではactualStatsをnullにしてください",
        path: ["actualStats"],
      });
    }

    if (pokemon.statDataStatus !== "partial" && pokemon.actualStats === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactまたはderivedではactualStatsが必要です",
        path: ["actualStats"],
      });
    }

    if (
      pokemon.statDataStatus === "derived" &&
      (pokemon.nature === null ||
        pokemon.evs === null ||
        pokemon.ivs === null ||
        !completeArchetypeIvsSchema.safeParse(pokemon.ivs).success)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "derivedでは性格・EV・全6能力のIVが必要です",
        path: ["statDataStatus"],
      });
    }
  });

export const publicArchetypeSourceSchema = z
  .object({
    title: requiredTextSchema,
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((url) => /^https?:\/\//iu.test(url), "出典URLはhttpまたはhttpsで指定してください"),
    siteName: requiredTextSchema,
  })
  .strict();

export const publicArchetypeDetailSchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    rule: publicArchetypeRuleSchema,
    season: publicArchetypeSeasonSchema,
    defaultLeads: archetypeDefaultLeadsSchema,
    playstyleNotes: nullableTextSchema,
    pokemons: z.array(publicArchetypePokemonSchema).min(1).max(ARCHETYPE_TEAM_SIZE_MAX),
    sources: z.array(publicArchetypeSourceSchema),
  })
  .strict()
  .superRefine((archetype, context) => {
    if (archetype.rule.pickSize > archetype.rule.teamSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "選出数はチーム人数以下である必要があります",
        path: ["rule", "pickSize"],
      });
    }

    if (archetype.pokemons.length !== archetype.rule.teamSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築のポケモン数がRuleのチーム人数と一致しません",
        path: ["pokemons"],
      });
    }

    const slots = archetype.pokemons.map((pokemon) => pokemon.slot);
    if (new Set(slots).size !== slots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のslotは重複できません",
        path: ["pokemons"],
      });
    }

    const pokemonIds = archetype.pokemons.map((pokemon) => pokemon.pokemon.id);
    if (new Set(pokemonIds).size !== pokemonIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のポケモンは重複できません",
        path: ["pokemons"],
      });
    }

    if (
      !archetypeDefaultLeadsForPickSizeSchema(archetype.rule.pickSize).safeParse(
        archetype.defaultLeads,
      ).success
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "基本選出数は0件またはRuleの選出数と一致させてください",
        path: ["defaultLeads"],
      });
    }

    const slotSet = new Set(slots);
    for (const [index, slot] of archetype.defaultLeads.entries()) {
      if (!slotSet.has(slot)) {
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
        message: "出典URLは重複できません",
        path: ["sources"],
      });
    }
  });

export type PublicArchetypeDetail = z.infer<typeof publicArchetypeDetailSchema>;
