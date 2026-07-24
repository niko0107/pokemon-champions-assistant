import { z } from "zod";
import { abilityMasterSchema } from "../master/ability";
import { MASTER_SEARCH_RESULT_LIMIT, positiveMasterIdQuerySchema } from "./master-search";

/** GET /api/v1/master/abilities?pokemon_id= のAPI契約。 */
export const abilitySearchQuerySchema = z.object({
  pokemon_id: positiveMasterIdQuerySchema,
});

export type AbilitySearchQuery = z.infer<typeof abilitySearchQuerySchema>;

export const abilitySummarySchema = abilityMasterSchema.extend({
  id: z.number().int().positive(),
});

export type AbilitySummary = z.infer<typeof abilitySummarySchema>;

export const abilitySearchResponseSchema = z.object({
  items: z.array(abilitySummarySchema).max(MASTER_SEARCH_RESULT_LIMIT),
});

export type AbilitySearchResponse = z.infer<typeof abilitySearchResponseSchema>;
