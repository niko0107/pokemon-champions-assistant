import {
  observationResponseSchema,
  pokemonSummarySchema,
  type ObservationResponse,
  type PokemonSummary,
} from "@pokemon-champions/shared";
import { z } from "zod";

const STORAGE_PREFIX = "pokemon-champions.battle.observations.v1";

const storedObservationSchema = observationResponseSchema
  .extend({
    kind: z.literal("pokemon"),
    moveId: z.null(),
    itemId: z.null(),
    abilityId: z.null(),
    position: z.null(),
    isRevoked: z.literal(false),
  })
  .strict();

const storedPokemonObservationSchema = z
  .object({
    pokemon: pokemonSummarySchema.strict(),
    observation: storedObservationSchema,
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

const storedBattleStateSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().uuid(),
    items: z.array(storedPokemonObservationSchema).max(6),
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

export type StoredPokemonObservation = z.infer<typeof storedPokemonObservationSchema>;

export function toStoredPokemonObservation(
  pokemon: PokemonSummary,
  observation: ObservationResponse,
): StoredPokemonObservation {
  return storedPokemonObservationSchema.parse({ pokemon, observation });
}

export function battleObservationStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

export function loadBattleObservations(
  sessionId: string,
  storage: Storage = window.sessionStorage,
): StoredPokemonObservation[] {
  const key = battleObservationStorageKey(sessionId);
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return [];
    }
    const result = storedBattleStateSchema.safeParse(JSON.parse(raw));
    if (!result.success || result.data.sessionId !== sessionId) {
      storage.removeItem(key);
      return [];
    }
    return result.data.items;
  } catch {
    storage.removeItem(key);
    return [];
  }
}

export function saveBattleObservations(
  sessionId: string,
  items: StoredPokemonObservation[],
  storage: Storage = window.sessionStorage,
): void {
  const state = storedBattleStateSchema.parse({
    version: 1,
    sessionId,
    items,
  });
  try {
    storage.setItem(battleObservationStorageKey(sessionId), JSON.stringify(state));
  } catch {
    // sessionStorageが利用できない場合も、成功済みObservationの画面表示は継続する。
  }
}
