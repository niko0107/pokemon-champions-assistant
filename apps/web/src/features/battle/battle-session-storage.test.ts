import type { ObservationResponse, PokemonSummary } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  battleObservationStorageKey,
  loadBattleObservations,
  saveBattleObservations,
  toStoredPokemonObservation,
} from "./battle-session-storage";

const sessionId = "10000000-0000-4000-8000-000000000001";
const pokemon: PokemonSummary = {
  id: 6,
  dexNo: 6,
  nameJa: "リザードン",
  nameEn: "Charizard",
  form: "normal",
  type1: "fire",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};
const observation: ObservationResponse = {
  id: "20000000-0000-4000-8000-000000000001",
  sessionId,
  seq: 1,
  kind: "pokemon",
  pokemonId: 6,
  moveId: null,
  itemId: null,
  abilityId: null,
  position: null,
  isRevoked: false,
  createdAt: "2026-07-26T00:00:00.000Z",
};

describe("battle observation session storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("Session単位で成功済みPokemon観測を保存・復元する", () => {
    const item = toStoredPokemonObservation(pokemon, observation);
    saveBattleObservations(sessionId, [item]);

    expect(loadBattleObservations(sessionId)).toEqual([item]);
    expect(loadBattleObservations("10000000-0000-4000-8000-000000000002")).toEqual([]);
  });

  it("不正JSON・schema不一致・内部情報を含む値を破棄する", () => {
    const key = battleObservationStorageKey(sessionId);
    window.sessionStorage.setItem(key, "{invalid");
    expect(loadBattleObservations(sessionId)).toEqual([]);
    expect(window.sessionStorage.getItem(key)).toBeNull();

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        sessionId,
        items: [{ pokemon: { ...pokemon, passwordHash: "secret" }, observation }],
      }),
    );
    expect(loadBattleObservations(sessionId)).toEqual([]);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("Pokemon ID不一致、重複、逆順seqを拒否する", () => {
    expect(() => toStoredPokemonObservation({ ...pokemon, id: 7 }, observation)).toThrow();

    const item = toStoredPokemonObservation(pokemon, observation);
    expect(() =>
      saveBattleObservations(sessionId, [
        item,
        {
          ...item,
          observation: {
            ...item.observation,
            id: "20000000-0000-4000-8000-000000000002",
            seq: 1,
          },
        },
      ]),
    ).toThrow();
  });
});
