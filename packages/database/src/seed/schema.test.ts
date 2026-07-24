import { describe, expect, it } from "vitest";
import { sampleMasterData } from "./sample-data";
import {
  orderPokemonsByBaseForm,
  sampleMasterDataSchema,
  validateSampleMasterData,
} from "./schema";

describe("MASTER-005 sample master data", () => {
  it("必要な件数と全参照を含むサンプルを受理する", () => {
    const parsed = validateSampleMasterData(sampleMasterData);

    expect(parsed.pokemons.filter((pokemon) => !pokemon.isMega)).toHaveLength(3);
    expect(parsed.pokemons.filter((pokemon) => pokemon.isMega)).toHaveLength(1);
    expect(parsed.moves.length).toBeGreaterThanOrEqual(5);
    expect(parsed.items.length).toBeGreaterThanOrEqual(3);
    expect(parsed.abilities.length).toBeGreaterThanOrEqual(3);
    expect(parsed.pokemonMoves.length).toBeGreaterThanOrEqual(5);
    expect(parsed.seasons).toHaveLength(1);
    expect(parsed.rules).toHaveLength(1);
  });

  it("元ポケモンをメガ形態より先に並べる", () => {
    const parsed = validateSampleMasterData(sampleMasterData);
    const ordered = orderPokemonsByBaseForm([...parsed.pokemons].reverse());
    const normalIndex = ordered.findIndex(
      (pokemon) => pokemon.dexNo === 130 && pokemon.form === "normal",
    );
    const megaIndex = ordered.findIndex(
      (pokemon) => pokemon.dexNo === 130 && pokemon.form === "mega",
    );

    expect(normalIndex).toBeGreaterThanOrEqual(0);
    expect(megaIndex).toBeGreaterThan(normalIndex);
  });

  it("存在しない技を参照するPokemonMoveを拒否する", () => {
    const invalidData = {
      ...sampleMasterData,
      pokemonMoves: [
        ...sampleMasterData.pokemonMoves,
        {
          pokemon: { dexNo: 130, form: "normal" },
          moveNameEn: "Missing Move",
        },
      ],
    };

    expect(sampleMasterDataSchema.safeParse(invalidData).success).toBe(false);
  });

  it("循環する元ポケモン参照を拒否する", () => {
    const invalidData = {
      ...sampleMasterData,
      pokemons: sampleMasterData.pokemons.map((pokemon) => {
        if (pokemon.dexNo === 130 && pokemon.form === "normal") {
          return {
            ...pokemon,
            basePokemon: { dexNo: 130, form: "mega" },
          };
        }
        return pokemon;
      }),
    };

    expect(sampleMasterDataSchema.safeParse(invalidData).success).toBe(false);
  });
});
