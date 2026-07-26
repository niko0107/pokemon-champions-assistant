import {
  moveSummarySchema,
  observationResponseSchema,
  pokemonSummarySchema,
  type UndoObservationResponse,
  type MoveSummary,
  type ObservationResponse,
  type PokemonSummary,
} from "@pokemon-champions/shared";
import { z } from "zod";

const LEGACY_STORAGE_PREFIX = "pokemon-champions.battle.observations.v1";
const STORAGE_PREFIX = "pokemon-champions.battle.observations.v2";

const storedPokemonObservationResponseSchema = observationResponseSchema
  .extend({
    kind: z.literal("pokemon"),
    moveId: z.null(),
    itemId: z.null(),
    abilityId: z.null(),
    position: z.null(),
    isRevoked: z.boolean(),
  })
  .strict();

const storedMoveObservationResponseSchema = observationResponseSchema
  .extend({
    kind: z.literal("move"),
    moveId: z.number().int().positive(),
    itemId: z.null(),
    abilityId: z.null(),
    position: z.null(),
    isRevoked: z.boolean(),
  })
  .strict();

const legacyStoredPokemonObservationResponseSchema = storedPokemonObservationResponseSchema.extend({
  isRevoked: z.literal(false),
});

const legacyStoredPokemonObservationSchema = z
  .object({
    pokemon: pokemonSummarySchema.strict(),
    observation: legacyStoredPokemonObservationResponseSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pokemon.id !== value.observation.pokemonId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pokemon IDが一致しません",
        path: ["observation", "pokemonId"],
      });
    }
  });

const storedPokemonObservationSchema = z
  .object({
    type: z.literal("pokemon"),
    pokemon: pokemonSummarySchema.strict(),
    observation: storedPokemonObservationResponseSchema,
  })
  .strict();

const validatedStoredPokemonObservationSchema = storedPokemonObservationSchema.superRefine(
  (value, context) => {
    if (value.pokemon.id !== value.observation.pokemonId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pokemon IDが一致しません",
        path: ["observation", "pokemonId"],
      });
    }
  },
);

const storedMoveObservationSchema = z
  .object({
    type: z.literal("move"),
    move: moveSummarySchema.strict(),
    observation: storedMoveObservationResponseSchema,
  })
  .strict();

const validatedStoredMoveObservationSchema = storedMoveObservationSchema.superRefine(
  (value, context) => {
    if (value.move.id !== value.observation.moveId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Move IDが一致しません",
        path: ["observation", "moveId"],
      });
    }
  },
);

const storedBattleObservationSchema = z.discriminatedUnion("type", [
  storedPokemonObservationSchema,
  storedMoveObservationSchema,
]);

const legacyStoredBattleStateSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().uuid(),
    items: z.array(legacyStoredPokemonObservationSchema).max(6),
  })
  .strict()
  .superRefine((value, context) => {
    const pokemonIds = new Set<number>();
    let previousSeq = 0;

    value.items.forEach((item, index) => {
      if (item.observation.sessionId !== value.sessionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Session IDが一致しません",
          path: ["items", index, "observation", "sessionId"],
        });
      }
      if (pokemonIds.has(item.pokemon.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pokemonが重複しています",
          path: ["items", index, "pokemon", "id"],
        });
      }
      pokemonIds.add(item.pokemon.id);
      if (item.observation.seq <= previousSeq) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "観測順が正しくありません",
          path: ["items", index, "observation", "seq"],
        });
      }
      previousSeq = item.observation.seq;
    });
  });

const storedBattleStateSchema = z
  .object({
    version: z.literal(2),
    sessionId: z.string().uuid(),
    observations: z.array(storedBattleObservationSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const observationIds = new Set<string>();
    const historicalPokemonIds = new Set<number>();
    const activePokemonIds = new Set<number>();
    const activeMoveKeys = new Set<string>();
    let activePokemonCount = 0;
    let previousSeq = 0;

    value.observations.forEach((item, index) => {
      const { observation } = item;
      if (observation.sessionId !== value.sessionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Session IDが一致しません",
          path: ["observations", index, "observation", "sessionId"],
        });
      }
      if (observationIds.has(observation.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Observationが重複しています",
          path: ["observations", index, "observation", "id"],
        });
      }
      observationIds.add(observation.id);
      if (observation.seq <= previousSeq) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "観測順が正しくありません",
          path: ["observations", index, "observation", "seq"],
        });
      }
      previousSeq = observation.seq;

      if (item.type === "pokemon") {
        historicalPokemonIds.add(item.pokemon.id);
        if (!observation.isRevoked) {
          activePokemonCount += 1;
        }
        if (activePokemonCount > 6) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "有効なPokemon観測は6件以下である必要があります",
            path: ["observations", index],
          });
        }
        if (item.pokemon.id !== observation.pokemonId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Pokemon IDが一致しません",
            path: ["observations", index, "observation", "pokemonId"],
          });
        }
        if (!observation.isRevoked && activePokemonIds.has(item.pokemon.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "有効なPokemonが重複しています",
            path: ["observations", index, "pokemon", "id"],
          });
        }
        if (!observation.isRevoked) {
          activePokemonIds.add(item.pokemon.id);
        }
        return;
      }

      if (item.move.id !== observation.moveId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Move IDが一致しません",
          path: ["observations", index, "observation", "moveId"],
        });
      }
      if (!historicalPokemonIds.has(observation.pokemonId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "技の対象Pokemonが登録されていません",
          path: ["observations", index, "observation", "pokemonId"],
        });
      }
      const moveKey = `${observation.pokemonId}:${observation.moveId}`;
      if (!observation.isRevoked && activeMoveKeys.has(moveKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "同じPokemonの有効な技が重複しています",
          path: ["observations", index, "observation", "moveId"],
        });
      }
      if (!observation.isRevoked) {
        activeMoveKeys.add(moveKey);
      }
    });
  });

export type StoredPokemonObservation = z.infer<typeof storedPokemonObservationSchema>;
export type StoredMoveObservation = z.infer<typeof storedMoveObservationSchema>;
export type StoredBattleObservation = z.infer<typeof storedBattleObservationSchema>;

export function toStoredPokemonObservation(
  pokemon: PokemonSummary,
  observation: ObservationResponse,
): StoredPokemonObservation {
  return validatedStoredPokemonObservationSchema.parse({ type: "pokemon", pokemon, observation });
}

export function toStoredMoveObservation(
  move: MoveSummary,
  observation: ObservationResponse,
): StoredMoveObservation {
  return validatedStoredMoveObservationSchema.parse({ type: "move", move, observation });
}

export function getLatestActiveBattleObservation(
  sessionId: string,
  observations: StoredBattleObservation[],
): StoredBattleObservation | null {
  return (
    observations.reduce<StoredBattleObservation | null>((latest, item) => {
      if (item.observation.sessionId !== sessionId || item.observation.isRevoked) {
        return latest;
      }
      return latest === null || item.observation.seq > latest.observation.seq ? item : latest;
    }, null) ?? null
  );
}

export function applyBattleObservationUndo(
  sessionId: string,
  observations: StoredBattleObservation[],
  response: UndoObservationResponse,
): StoredBattleObservation[] {
  const latest = getLatestActiveBattleObservation(sessionId, observations);
  if (
    !latest ||
    response.sessionId !== sessionId ||
    response.id !== latest.observation.id ||
    response.seq !== latest.observation.seq ||
    response.kind !== latest.observation.kind ||
    response.pokemonId !== latest.observation.pokemonId ||
    response.moveId !== latest.observation.moveId ||
    response.itemId !== latest.observation.itemId ||
    response.abilityId !== latest.observation.abilityId ||
    response.position !== latest.observation.position ||
    response.createdAt !== latest.observation.createdAt ||
    response.isRevoked !== true
  ) {
    throw new Error("Undo response does not match the latest active observation");
  }

  const next = observations.map((item) =>
    item.observation.id === response.id
      ? {
          ...item,
          observation: {
            ...item.observation,
            isRevoked: true as const,
          },
        }
      : item,
  );

  return storedBattleStateSchema.parse({
    version: 2,
    sessionId,
    observations: next,
  }).observations;
}

export function battleObservationStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

export function legacyBattleObservationStorageKey(sessionId: string): string {
  return `${LEGACY_STORAGE_PREFIX}:${sessionId}`;
}

function saveParsedState(
  sessionId: string,
  observations: StoredBattleObservation[],
  storage: Storage,
): boolean {
  const state = storedBattleStateSchema.parse({
    version: 2,
    sessionId,
    observations,
  });
  try {
    storage.setItem(battleObservationStorageKey(sessionId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function migrateLegacyState(sessionId: string, storage: Storage): StoredBattleObservation[] | null {
  const legacyKey = legacyBattleObservationStorageKey(sessionId);
  try {
    const raw = storage.getItem(legacyKey);
    if (!raw) {
      return null;
    }
    const result = legacyStoredBattleStateSchema.safeParse(JSON.parse(raw));
    if (!result.success || result.data.sessionId !== sessionId) {
      storage.removeItem(legacyKey);
      return null;
    }
    const observations = result.data.items.map((item) =>
      storedPokemonObservationSchema.parse({ type: "pokemon", ...item }),
    );
    if (saveParsedState(sessionId, observations, storage)) {
      storage.removeItem(legacyKey);
    }
    return observations;
  } catch {
    storage.removeItem(legacyKey);
    return null;
  }
}

export function loadBattleObservations(
  sessionId: string,
  storage: Storage = window.sessionStorage,
): StoredBattleObservation[] {
  const key = battleObservationStorageKey(sessionId);
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const result = storedBattleStateSchema.safeParse(JSON.parse(raw));
      if (result.success && result.data.sessionId === sessionId) {
        return result.data.observations;
      }
      storage.removeItem(key);
    }
  } catch {
    storage.removeItem(key);
  }

  return migrateLegacyState(sessionId, storage) ?? [];
}

export function saveBattleObservations(
  sessionId: string,
  observations: StoredBattleObservation[],
  storage: Storage = window.sessionStorage,
): void {
  saveParsedState(sessionId, observations, storage);
}
