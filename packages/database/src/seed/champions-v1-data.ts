import { readFileSync } from "node:fs";
import { abilityMasterSchema, moveMasterSchema } from "@pokemon-champions/shared";
import { z } from "zod";
import { sampleMasterData } from "./sample-data";
import {
  pokemonReferenceSchema,
  pokemonSeedSchema,
  validateSampleMasterData,
  type SampleMasterData,
} from "./schema";

const sourcePokemonSchema = z
  .object({
    pokeapiId: z.number().int().positive(),
    pokeapiSpeciesId: z.number().int().positive(),
    pokeapiIsDefault: z.boolean(),
    sourceFormIds: z.array(z.number().int().positive()).min(1),
    pokemon: pokemonSeedSchema,
  })
  .strict();

const sourceMoveSchema = moveMasterSchema
  .extend({
    pokeapiId: z.number().int().positive(),
  })
  .strict();

const sourceAbilitySchema = abilityMasterSchema
  .extend({
    pokeapiId: z.number().int().positive(),
  })
  .strict();

const sourcePokemonMovesSchema = z.array(
  z
    .object({
      pokemonId: z.number().int().positive(),
      moveIds: z.array(z.number().int().positive()).min(1),
    })
    .strict(),
);

const sourceManifestSchema = z
  .object({
    dataset: z.string().min(1),
    gameVersion: z.literal("Pokémon Champions v1.0"),
    retrievedAt: z.string().date(),
    license: z.literal("BSD-3-Clause"),
    source: z
      .object({
        repository: z.string().url(),
        learnsetPullRequest: z.string().url(),
        learnsetCommit: z.string().regex(/^[0-9a-f]{40}$/),
        completenessFixPullRequest: z.string().url(),
        completenessFixCommit: z.string().regex(/^[0-9a-f]{40}$/),
        apiDataRepository: z.string().url(),
        apiDataCommit: z.string().regex(/^[0-9a-f]{40}$/),
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
    expected: z
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
      .strict(),
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
    readFileSync(new URL(`./data/champions-v1/${relativePath}`, import.meta.url), "utf8"),
  );
}

export const championsV1SourceManifest = sourceManifestSchema.parse(
  loadJson("source-manifest.json"),
);
export const championsV1SourcePokemons = z
  .array(sourcePokemonSchema)
  .parse(loadJson("pokemons.json"));
export const championsV1SourceMoves = z.array(sourceMoveSchema).parse(loadJson("moves.json"));
export const championsV1SourceAbilities = z
  .array(sourceAbilitySchema)
  .parse(loadJson("abilities.json"));
export const championsV1SourcePokemonMoves = sourcePokemonMovesSchema.parse(
  loadJson("pokemon-moves.json"),
);

const pokemonReferenceByPokeapiId = new Map(
  championsV1SourcePokemons.map((entry) => [
    entry.pokeapiId,
    pokemonReferenceSchema.parse({
      dexNo: entry.pokemon.dexNo,
      form: entry.pokemon.form,
    }),
  ]),
);
const moveNameByPokeapiId = new Map(
  championsV1SourceMoves.map((move) => [move.pokeapiId, move.nameEn]),
);

const pokemonMoves = championsV1SourcePokemonMoves.flatMap((entry) => {
  const pokemon = pokemonReferenceByPokeapiId.get(entry.pokemonId);
  if (!pokemon) {
    throw new Error(`PokemonMoveのPokeAPI Pokemon ID ${entry.pokemonId}を解決できません`);
  }
  return entry.moveIds.map((moveId) => {
    const moveNameEn = moveNameByPokeapiId.get(moveId);
    if (!moveNameEn) {
      throw new Error(`PokemonMoveのPokeAPI Move ID ${moveId}を解決できません`);
    }
    return { pokemon, moveNameEn };
  });
});

export const championsV1MasterData: SampleMasterData = validateSampleMasterData({
  pokemons: championsV1SourcePokemons.map((entry) => entry.pokemon),
  moves: championsV1SourceMoves.map(({ pokeapiId: _pokeapiId, ...move }) => move),
  items: sampleMasterData.items,
  abilities: championsV1SourceAbilities.map(({ pokeapiId: _pokeapiId, ...ability }) => ability),
  pokemonMoves,
  seasons: sampleMasterData.seasons,
  rules: sampleMasterData.rules,
});
