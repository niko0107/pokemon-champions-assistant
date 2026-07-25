import { z } from "zod";
import { BATTLE_SESSION_STATUSES, OBSERVATION_KINDS, OBSERVATION_POSITIONS } from "../enums";

const timestampSchema = z.string().datetime({ offset: true });
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const masterIdSchema = z.number().int().positive().safe().max(POSTGRES_INTEGER_MAX);

export const battleSessionStatusSchema = z.enum(BATTLE_SESSION_STATUSES);

export const battleSessionCreateSchema = z
  .object({
    partyId: z.string().uuid(),
    ruleId: z.number().int().positive(),
  })
  .strict();

export type BattleSessionCreate = z.infer<typeof battleSessionCreateSchema>;

export const battleSessionIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type BattleSessionIdParams = z.infer<typeof battleSessionIdParamsSchema>;

export const battleSessionResponseSchema = z
  .object({
    id: z.string().uuid(),
    partyId: z.string().uuid(),
    ruleId: z.number().int().positive(),
    status: battleSessionStatusSchema,
    startedAt: timestampSchema,
    endedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type BattleSessionResponse = z.infer<typeof battleSessionResponseSchema>;

export const observationKindSchema = z.enum(OBSERVATION_KINDS);
export const observationPositionSchema = z.enum(OBSERVATION_POSITIONS);

const pokemonObservationCreateSchema = z
  .object({
    kind: z.literal("pokemon"),
    pokemonId: masterIdSchema,
  })
  .strict();

const moveObservationCreateSchema = z
  .object({
    kind: z.literal("move"),
    pokemonId: masterIdSchema,
    moveId: masterIdSchema,
  })
  .strict();

const itemObservationCreateSchema = z
  .object({
    kind: z.literal("item"),
    pokemonId: masterIdSchema,
    itemId: masterIdSchema,
  })
  .strict();

const abilityObservationCreateSchema = z
  .object({
    kind: z.literal("ability"),
    pokemonId: masterIdSchema,
    abilityId: masterIdSchema,
  })
  .strict();

const positionObservationCreateSchema = z
  .object({
    kind: z.literal("position"),
    pokemonId: masterIdSchema,
    position: observationPositionSchema,
  })
  .strict();

const megaObservationCreateSchema = z
  .object({
    kind: z.literal("mega"),
    pokemonId: masterIdSchema,
  })
  .strict();

export const observationCreateSchema = z.discriminatedUnion("kind", [
  pokemonObservationCreateSchema,
  moveObservationCreateSchema,
  itemObservationCreateSchema,
  abilityObservationCreateSchema,
  positionObservationCreateSchema,
  megaObservationCreateSchema,
]);

export type ObservationCreate = z.infer<typeof observationCreateSchema>;

export const observationResponseSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    seq: masterIdSchema,
    kind: observationKindSchema,
    pokemonId: masterIdSchema,
    moveId: masterIdSchema.nullable(),
    itemId: masterIdSchema.nullable(),
    abilityId: masterIdSchema.nullable(),
    position: observationPositionSchema.nullable(),
    isRevoked: z.boolean(),
    createdAt: timestampSchema,
  })
  .strict();

export type ObservationResponse = z.infer<typeof observationResponseSchema>;

export const undoObservationParamsSchema = z
  .object({
    id: z.string().uuid(),
    obsId: z.string().uuid(),
  })
  .strict();

export type UndoObservationParams = z.infer<typeof undoObservationParamsSchema>;

export const undoObservationResponseSchema = observationResponseSchema
  .extend({
    isRevoked: z.literal(true),
  })
  .strict();

export type UndoObservationResponse = z.infer<typeof undoObservationResponseSchema>;
