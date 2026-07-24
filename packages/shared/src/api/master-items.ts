import { z } from "zod";
import { itemMasterSchema } from "../master/item";
import { MASTER_SEARCH_RESULT_LIMIT, masterSearchTextSchema } from "./master-search";

/** GET /api/v1/master/items?q= のAPI契約。 */
export const itemSearchQuerySchema = z.object({
  q: masterSearchTextSchema,
});

export type ItemSearchQuery = z.infer<typeof itemSearchQuerySchema>;

export const itemSummarySchema = itemMasterSchema.extend({
  id: z.number().int().positive(),
});

export type ItemSummary = z.infer<typeof itemSummarySchema>;

export const itemSearchResponseSchema = z.object({
  items: z.array(itemSummarySchema).max(MASTER_SEARCH_RESULT_LIMIT),
});

export type ItemSearchResponse = z.infer<typeof itemSearchResponseSchema>;
