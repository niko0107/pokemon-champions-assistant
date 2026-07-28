import { describe, expect, it } from "vitest";
import {
  championsCurrentDeltaSourceAbilities,
  championsCurrentDeltaSourceMoves,
  championsCurrentDeltaSourcePokemons,
  championsCurrentMasterData,
  championsCurrentSourceManifest,
} from "./champions-current-data";
import { validateChampionsCurrentDataQuality } from "./champions-current-validation";
import { validateSampleMasterData } from "./schema";

describe("MASTER-009B Pokémon Champions current data", () => {
  it("固定したPokéAPI sourceと実差分件数を満たす", () => {
    expect(championsCurrentSourceManifest.source).toMatchObject({
      snapshotCommit: "227b573712414a86ba299d322fa398fbb2893edc",
      pokemonCommit: "522d8577237c4db0846c3694306d4f36508f19e3",
      abilityCommit: "c01d35ac356c5d9ba00dfff5dcc9d8aca72b2b2b",
      learnsetCommit: "227b573712414a86ba299d322fa398fbb2893edc",
      apiDataCommit: "bf40800cc9d1ffd04a3fc14347d2ad24d470526b",
    });
    expect(championsCurrentSourceManifest.filters).toEqual({
      versionGroupId: 32,
      versionGroupIdentifier: "champions",
      moveMethodId: 12,
      moveMethodIdentifier: "train",
    });
    expect(validateChampionsCurrentDataQuality()).toEqual({
      pokemonDelta: 38,
      pokemonFinal: 319,
      normalPokemonDelta: 22,
      megaPokemonDelta: 16,
      movesDelta: 6,
      movesFinal: 496,
      abilitiesDelta: 9,
      abilitiesFinal: 200,
      itemsDelta: 0,
      itemsFinal: 3,
      pokemonMovesDelta: 2_416,
      pokemonMovesFinal: 19_810,
      zeroMovePokemon: 0,
      removedV1PokemonMoves: 0,
    });
  });

  it("正式名・Mega元・priorityだけのタグ方針を維持する", () => {
    expect(
      championsCurrentDeltaSourcePokemons
        .filter((entry) => entry.pokemon.isMega)
        .every((entry) => entry.pokemon.basePokemon !== null),
    ).toBe(true);
    expect(championsCurrentDeltaSourceAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nameJa: "うなぎのぼり", nameEn: "Eelevate" }),
        expect.objectContaining({ nameJa: "ほのおのたてがみ", nameEn: "Fire Mane" }),
      ]),
    );
    expect(
      championsCurrentDeltaSourceMoves.every(
        (move) => move.tags.length === 0 || (move.tags.length === 1 && move.tags[0] === "priority"),
      ),
    ).toBe(true);
  });

  it("Itemを増やさず、入力配列順に依存せずseed契約を満たす", () => {
    expect(championsCurrentSourceManifest.items).toMatchObject({
      delta: 0,
      final: 3,
      catalogComplete: false,
    });
    expect(championsCurrentMasterData.items).toHaveLength(3);

    const reversed = validateSampleMasterData({
      ...championsCurrentMasterData,
      pokemons: [...championsCurrentMasterData.pokemons].reverse(),
      moves: [...championsCurrentMasterData.moves].reverse(),
      abilities: [...championsCurrentMasterData.abilities].reverse(),
      pokemonMoves: [...championsCurrentMasterData.pokemonMoves].reverse(),
    });

    expect(reversed.pokemons).toHaveLength(319);
    expect(reversed.pokemonMoves).toHaveLength(19_810);
  });
});
