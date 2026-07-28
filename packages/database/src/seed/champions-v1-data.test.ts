import { describe, expect, it } from "vitest";
import {
  championsV1MasterData,
  championsV1SourceManifest,
  championsV1SourceMoves,
  championsV1SourcePokemons,
} from "./champions-v1-data";
import { validateChampionsV1DataQuality } from "./champions-v1-validation";
import { validateSampleMasterData } from "./schema";

describe("MASTER-009A Pokémon Champions v1.0 data", () => {
  it("固定したPokeAPI sourceと期待件数を満たす", () => {
    expect(championsV1SourceManifest.source.learnsetCommit).toBe(
      "286d7a071bc50ec4a57e3f3f506a13220ce6f903",
    );
    expect(championsV1SourceManifest.source.completenessFixCommit).toBe(
      "2829e8496ca3bb078b0b80ce1a1bdeda0792efa7",
    );
    expect(championsV1SourceManifest.source.apiDataCommit).toBe(
      "155ea230292d72beff9325cca47ea281d511033a",
    );
    expect(championsV1SourceManifest.filters).toEqual({
      versionGroupId: 32,
      versionGroupIdentifier: "champions",
      moveMethodId: 12,
      moveMethodIdentifier: "train",
    });

    expect(validateChampionsV1DataQuality()).toEqual({
      pokemon: 281,
      pokemonSpecies: 186,
      pokemonFormRows: 377,
      nonDefaultPokemon: 96,
      megaPokemon: 60,
      moves: 490,
      items: 3,
      abilities: 191,
      pokemonMoves: 17_394,
      zeroMovePokemon: 0,
      maximumMovesPerPokemon: 105,
    });
  });

  it("日本語名・Mega元・推測しないタグ方針を維持する", () => {
    expect(championsV1SourcePokemons.every((entry) => entry.pokemon.nameJa.trim().length > 0)).toBe(
      true,
    );
    expect(
      championsV1SourcePokemons
        .filter((entry) => entry.pokemon.isMega)
        .every((entry) => entry.pokemon.basePokemon !== null),
    ).toBe(true);
    expect(
      championsV1SourceMoves.every(
        (move) => move.tags.length === 0 || (move.tags.length === 1 && move.tags[0] === "priority"),
      ),
    ).toBe(true);
  });

  it("入力配列順に依存せず既存seed契約を満たす", () => {
    const reversed = validateSampleMasterData({
      ...championsV1MasterData,
      pokemons: [...championsV1MasterData.pokemons].reverse(),
      moves: [...championsV1MasterData.moves].reverse(),
      abilities: [...championsV1MasterData.abilities].reverse(),
      pokemonMoves: [...championsV1MasterData.pokemonMoves].reverse(),
    });

    expect(reversed.pokemons).toHaveLength(championsV1MasterData.pokemons.length);
    expect(reversed.pokemonMoves).toHaveLength(championsV1MasterData.pokemonMoves.length);
  });
});
