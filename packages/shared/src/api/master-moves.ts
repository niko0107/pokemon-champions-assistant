import { z } from "zod";
import { moveMasterSchema } from "../master/move";
import {
  MASTER_SEARCH_RESULT_LIMIT,
  masterSearchTextSchema,
  positiveMasterIdQuerySchema,
} from "./master-search";

/**
 * GET /api/v1/master/moves?q=&pokemon_id= のAPI契約。
 * qまたはpokemon_idの少なくとも一方を指定する。
 */
export const moveSearchQuerySchema = z
  .object({
    q: masterSearchTextSchema.optional(),
    pokemon_id: positiveMasterIdQuerySchema.optional(),
  })
  .superRefine((query, context) => {
    if (query.q === undefined && query.pokemon_id === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "q または pokemon_id のいずれかを指定してください",
        path: ["q"],
      });
    }
  });

export type MoveSearchQuery = z.infer<typeof moveSearchQuerySchema>;

export const moveSummarySchema = moveMasterSchema.extend({
  id: z.number().int().positive(),
});

export type MoveSummary = z.infer<typeof moveSummarySchema>;

export const moveSearchResponseSchema = z.object({
  items: z.array(moveSummarySchema).max(MASTER_SEARCH_RESULT_LIMIT),
});

export type MoveSearchResponse = z.infer<typeof moveSearchResponseSchema>;
