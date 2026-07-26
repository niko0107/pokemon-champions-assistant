import type { MoveSummary, ObservationResponse, PokemonSummary } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  battleObservationStorageKey,
  applyBattleObservationUndo,
  getLatestActiveBattleObservation,
  legacyBattleObservationStorageKey,
  loadBattleObservations,
  saveBattleObservations,
  toStoredMoveObservation,
  toStoredPokemonObservation,
} from "./battle-session-storage";

const sessionId = "10000000-0000-4000-8000-000000000001";
const otherSessionId = "10000000-0000-4000-8000-000000000002";
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
const move: MoveSummary = {
  id: 53,
  nameJa: "かえんほうしゃ",
  nameEn: "Flamethrower",
  type: "fire",
  category: "special",
  power: 90,
  accuracy: 100,
  priority: 0,
  tags: [],
};
const pokemonObservation: ObservationResponse = {
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
const moveObservation: ObservationResponse = {
  ...pokemonObservation,
  id: "20000000-0000-4000-8000-000000000002",
  seq: 2,
  kind: "move",
  moveId: 53,
};

describe("battle observation session storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("Session単位で成功済みPokemon・技観測をseq順に保存・復元する", () => {
    const pokemonItem = toStoredPokemonObservation(pokemon, pokemonObservation);
    const moveItem = toStoredMoveObservation(move, moveObservation);
    saveBattleObservations(sessionId, [pokemonItem, moveItem]);

    expect(loadBattleObservations(sessionId)).toEqual([pokemonItem, moveItem]);
    expect(loadBattleObservations(otherSessionId)).toEqual([]);
  });

  it("WEB-001のv1形式を検証してv2へ安全に移行する", () => {
    const legacyKey = legacyBattleObservationStorageKey(sessionId);
    window.sessionStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 1,
        sessionId,
        items: [{ pokemon, observation: pokemonObservation }],
      }),
    );

    expect(loadBattleObservations(sessionId)).toEqual([
      toStoredPokemonObservation(pokemon, pokemonObservation),
    ]);
    expect(window.sessionStorage.getItem(legacyKey)).toBeNull();
    expect(window.sessionStorage.getItem(battleObservationStorageKey(sessionId))).not.toBeNull();
  });

  it("不正JSON・schema不一致・余分な内部情報を含む値を破棄する", () => {
    const key = battleObservationStorageKey(sessionId);
    window.sessionStorage.setItem(key, "{invalid");
    expect(loadBattleObservations(sessionId)).toEqual([]);
    expect(window.sessionStorage.getItem(key)).toBeNull();

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        sessionId,
        observations: [
          {
            type: "pokemon",
            pokemon: { ...pokemon, passwordHash: "secret" },
            observation: pokemonObservation,
          },
        ],
      }),
    );
    expect(loadBattleObservations(sessionId)).toEqual([]);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("Pokemon・Move ID不一致を拒否する", () => {
    expect(() => toStoredPokemonObservation({ ...pokemon, id: 7 }, pokemonObservation)).toThrow();
    expect(() => toStoredMoveObservation({ ...move, id: 54 }, moveObservation)).toThrow();
  });

  it("未登録Pokemonの技、同一Pokemonの重複技、逆順seqを拒否する", () => {
    const pokemonItem = toStoredPokemonObservation(pokemon, pokemonObservation);
    const moveItem = toStoredMoveObservation(move, moveObservation);

    expect(() => saveBattleObservations(sessionId, [moveItem])).toThrow();
    expect(() =>
      saveBattleObservations(sessionId, [
        pokemonItem,
        moveItem,
        {
          ...moveItem,
          observation: {
            ...moveItem.observation,
            id: "20000000-0000-4000-8000-000000000003",
            seq: 3,
          },
        },
      ]),
    ).toThrow();
    expect(() =>
      saveBattleObservations(sessionId, [
        pokemonItem,
        {
          ...moveItem,
          observation: { ...moveItem.observation, seq: 1 },
        },
      ]),
    ).toThrow();
  });

  it("同じ技を別Pokemonへ保存できる", () => {
    const secondPokemon = { ...pokemon, id: 10006, form: "mega-x", isMega: true };
    const observations = [
      toStoredPokemonObservation(pokemon, pokemonObservation),
      toStoredMoveObservation(move, moveObservation),
      toStoredPokemonObservation(secondPokemon, {
        ...pokemonObservation,
        id: "20000000-0000-4000-8000-000000000003",
        seq: 3,
        pokemonId: 10006,
      }),
      toStoredMoveObservation(move, {
        ...moveObservation,
        id: "20000000-0000-4000-8000-000000000004",
        seq: 4,
        pokemonId: 10006,
      }),
    ];

    expect(() => saveBattleObservations(sessionId, observations)).not.toThrow();
    expect(loadBattleObservations(sessionId)).toEqual(observations);
  });

  it("配列順ではなく最大seqの有効ObservationをUndo対象にし、取消済みを飛ばす", () => {
    const pokemonItem = toStoredPokemonObservation(pokemon, pokemonObservation);
    const moveItem = toStoredMoveObservation(move, moveObservation);
    const revokedMove = {
      ...moveItem,
      observation: { ...moveItem.observation, isRevoked: true },
    };

    expect(getLatestActiveBattleObservation(sessionId, [revokedMove, pokemonItem])).toEqual(
      pokemonItem,
    );
    expect(getLatestActiveBattleObservation(otherSessionId, [pokemonItem, moveItem])).toBeNull();
    expect(
      getLatestActiveBattleObservation(sessionId, [
        pokemonItem,
        {
          ...moveItem,
          observation: { ...moveItem.observation, seq: 7 },
        },
      ]),
    ).toMatchObject({ observation: { id: moveObservation.id, seq: 7 } });
  });

  it("Undo成功時は対象を削除せずisRevokedだけ更新し、seq・表示情報・順番を保つ", () => {
    const pokemonItem = toStoredPokemonObservation(pokemon, pokemonObservation);
    const moveItem = toStoredMoveObservation(move, moveObservation);
    const next = applyBattleObservationUndo(sessionId, [pokemonItem, moveItem], {
      ...moveObservation,
      isRevoked: true,
    });

    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(pokemonItem);
    expect(next[1]).toEqual({
      ...moveItem,
      observation: { ...moveItem.observation, isRevoked: true },
    });
    saveBattleObservations(sessionId, next);
    expect(loadBattleObservations(sessionId)).toEqual(next);
  });

  it("UndoレスポンスのID・seq・payload不一致を拒否しローカル状態を変えない", () => {
    const items = [
      toStoredPokemonObservation(pokemon, pokemonObservation),
      toStoredMoveObservation(move, moveObservation),
    ];

    expect(() =>
      applyBattleObservationUndo(sessionId, items, {
        ...moveObservation,
        id: "20000000-0000-4000-8000-000000000099",
        isRevoked: true,
      }),
    ).toThrow();
    expect(() =>
      applyBattleObservationUndo(sessionId, items, {
        ...moveObservation,
        seq: 99,
        isRevoked: true,
      }),
    ).toThrow();
    expect(items[1]?.observation.isRevoked).toBe(false);
  });

  it("取消済みMove・Pokemonを履歴へ残したまま同じ観測を再追加できる", () => {
    const storedPokemon = toStoredPokemonObservation(pokemon, pokemonObservation);
    const storedMove = toStoredMoveObservation(move, moveObservation);
    const revokedPokemon = {
      ...storedPokemon,
      observation: { ...storedPokemon.observation, isRevoked: true },
    };
    const revokedMove = {
      ...storedMove,
      observation: { ...storedMove.observation, isRevoked: true },
    };
    const readdedPokemon = toStoredPokemonObservation(pokemon, {
      ...pokemonObservation,
      id: "20000000-0000-4000-8000-000000000003",
      seq: 3,
    });
    const readdedMove = toStoredMoveObservation(move, {
      ...moveObservation,
      id: "20000000-0000-4000-8000-000000000004",
      seq: 4,
    });

    expect(() =>
      saveBattleObservations(sessionId, [revokedPokemon, revokedMove, readdedPokemon, readdedMove]),
    ).not.toThrow();
  });

  it("Pokemon取消後も関連する有効Moveを孤立履歴として保持できる", () => {
    const storedPokemon = toStoredPokemonObservation(pokemon, pokemonObservation);
    const revokedPokemon = {
      ...storedPokemon,
      observation: { ...storedPokemon.observation, isRevoked: true },
    };
    const activeMove = toStoredMoveObservation(move, moveObservation);

    expect(() => saveBattleObservations(sessionId, [revokedPokemon, activeMove])).not.toThrow();
    expect(loadBattleObservations(sessionId)).toEqual([revokedPokemon, activeMove]);
  });
});
