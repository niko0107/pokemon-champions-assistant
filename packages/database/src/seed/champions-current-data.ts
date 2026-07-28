import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  buildChampionsMasterData,
  championsSourceAbilitySchema,
  championsSourceMoveSchema,
  championsSourcePokemonMovesSchema,
  championsSourcePokemonSchema,
  championsV1SourceAbilities,
  championsV1SourceMoves,
  championsV1SourcePokemonMoves,
  championsV1SourcePokemons,
} from "./champions-v1-data";

const expectedCountsSchema = z
  .object({
    pokemon: z.number().int().positive(),
    pokemonSpecies: z.number().int().positive(),
    pokemonFormRows: z.number().int().positive(),
    nonDefaultPokemon: z.number().int().nonnegative(),
    megaPokemon: z.number().int().positive(),
    moves: z.number().int().positive(),
    abilities: z.number().int().positive(),
    pokemonMoves: z.number().int().positive(),
    upstreamDisabledRelationsExcluded: z.number().int().nonnegative(),
  })
  .strict();

const sourceManifestSchema = z
  .object({
    dataset: z.literal("Pokémon Champions Regulation Set M-B current-version delta"),
    gameVersion: z.literal("Pokémon Champions Ver. 1.1.4"),
    contentVersion: z.literal("Pokémon Champions Ver. 1.1.0 / Regulation Set M-B"),
    retrievedAt: z.string().date(),
    license: z.literal("BSD-3-Clause"),
    source: z
      .object({
        repository: z.string().url(),
        snapshotCommit: z.string().regex(/^[0-9a-f]{40}$/),
        pokemonPullRequest: z.string().url(),
        pokemonCommit: z.string().regex(/^[0-9a-f]{40}$/),
        abilityPullRequest: z.string().url(),
        abilityCommit: z.string().regex(/^[0-9a-f]{40}$/),
        learnsetPullRequest: z.string().url(),
        learnsetCommit: z.string().regex(/^[0-9a-f]{40}$/),
        apiDataRepository: z.string().url(),
        apiDataCommit: z.string().regex(/^[0-9a-f]{40}$/),
        officialUpdateHistory: z.string().url(),
        officialRegulation: z.string().url(),
        officialRoster: z.string().url(),
      })
      .strict(),
    filters: z
      .object({
        versionGroupId: z.literal(32),
        versionGroupIdentifier: z.literal("champions"),
        moveMethodId: z.literal(12),
        moveMethodIdentifier: z.literal("train"),
      })
      .strict(),
    baseline: z
      .object({
        dataset: z.literal("Pokémon Champions v1.0 public master data"),
        pokemon: z.number().int().positive(),
        moves: z.number().int().positive(),
        abilities: z.number().int().positive(),
        pokemonMoves: z.number().int().positive(),
        items: z.number().int().positive(),
      })
      .strict(),
    expected: expectedCountsSchema,
    expectedFinal: expectedCountsSchema,
    items: z
      .object({
        delta: z.literal(0),
        final: z.number().int().positive(),
        catalogComplete: z.literal(false),
        policy: z.string().min(1),
      })
      .strict(),
    localizedAbilityNameOverrides: z
      .array(
        z
          .object({
            pokeapiId: z.number().int().positive(),
            nameJa: z.string().trim().min(1),
            source: z.string().url(),
          })
          .strict(),
      )
      .min(1),
    targetPokemonIds: z.array(z.number().int().positive()).min(1),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

function loadJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`./data/champions-current-delta/${relativePath}`, import.meta.url),
      "utf8",
    ),
  );
}

export const championsCurrentSourceManifest = sourceManifestSchema.parse(
  loadJson("source-manifest.json"),
);
export const championsCurrentDeltaSourcePokemons = z
  .array(championsSourcePokemonSchema)
  .parse(loadJson("pokemons.json"));
export const championsCurrentDeltaSourceMoves = z
  .array(championsSourceMoveSchema)
  .parse(loadJson("moves.json"));
export const championsCurrentDeltaSourceAbilities = z
  .array(championsSourceAbilitySchema)
  .parse(loadJson("abilities.json"));
export const championsCurrentDeltaSourcePokemonMoves = championsSourcePokemonMovesSchema.parse(
  loadJson("pokemon-moves.json"),
);

export const championsCurrentSourcePokemons = [
  ...championsV1SourcePokemons,
  ...championsCurrentDeltaSourcePokemons,
].sort((left, right) => left.pokeapiId - right.pokeapiId);
export const championsCurrentSourceMoves = [
  ...championsV1SourceMoves,
  ...championsCurrentDeltaSourceMoves,
].sort((left, right) => left.pokeapiId - right.pokeapiId);
export const championsCurrentSourceAbilities = [
  ...championsV1SourceAbilities,
  ...championsCurrentDeltaSourceAbilities,
].sort((left, right) => left.pokeapiId - right.pokeapiId);
export const championsCurrentSourcePokemonMoves = [
  ...championsV1SourcePokemonMoves,
  ...championsCurrentDeltaSourcePokemonMoves,
]
  .map((entry) => ({
    pokemonId: entry.pokemonId,
    moveIds: [...entry.moveIds].sort((a, b) => a - b),
  }))
  .sort((left, right) => left.pokemonId - right.pokemonId);

export const championsCurrentMasterData = buildChampionsMasterData({
  pokemons: championsCurrentSourcePokemons,
  moves: championsCurrentSourceMoves,
  abilities: championsCurrentSourceAbilities,
  pokemonMoves: championsCurrentSourcePokemonMoves,
});
