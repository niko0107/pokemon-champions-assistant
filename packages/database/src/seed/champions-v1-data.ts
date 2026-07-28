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

export const championsSourcePokemonSchema = z
  .object({
    pokeapiId: z.number().int().positive(),
    pokeapiSpeciesId: z.number().int().positive(),
    pokeapiIsDefault: z.boolean(),
    sourceFormIds: z.array(z.number().int().positive()).min(1),
    pokemon: pokemonSeedSchema,
  })
  .strict();

export const championsSourceMoveSchema = moveMasterSchema
  .extend({
    pokeapiId: z.number().int().positive(),
  })
  .strict();

export const championsSourceAbilitySchema = abilityMasterSchema
  .extend({
    pokeapiId: z.number().int().positive(),
  })
  .strict();

export const championsSourcePokemonMovesSchema = z.array(
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
  .array(championsSourcePokemonSchema)
  .parse(loadJson("pokemons.json"));
export const championsV1SourceMoves = z
  .array(championsSourceMoveSchema)
  .parse(loadJson("moves.json"));
export const championsV1SourceAbilities = z
  .array(championsSourceAbilitySchema)
  .parse(loadJson("abilities.json"));
export const championsV1SourcePokemonMoves = championsSourcePokemonMovesSchema.parse(
  loadJson("pokemon-moves.json"),
);

export type ChampionsSourcePokemon = z.infer<typeof championsSourcePokemonSchema>;
export type ChampionsSourceMove = z.infer<typeof championsSourceMoveSchema>;
export type ChampionsSourceAbility = z.infer<typeof championsSourceAbilitySchema>;
export type ChampionsSourcePokemonMoves = z.infer<typeof championsSourcePokemonMovesSchema>;

interface ChampionsSourceData {
  pokemons: readonly ChampionsSourcePokemon[];
  moves: readonly ChampionsSourceMove[];
  abilities: readonly ChampionsSourceAbility[];
  pokemonMoves: readonly ChampionsSourcePokemonMoves[number][];
}

export function buildChampionsMasterData(source: ChampionsSourceData): SampleMasterData {
  const pokemonReferenceByPokeapiId = new Map(
    source.pokemons.map((entry) => [
      entry.pokeapiId,
      pokemonReferenceSchema.parse({
        dexNo: entry.pokemon.dexNo,
        form: entry.pokemon.form,
      }),
    ]),
  );
  const moveNameByPokeapiId = new Map(source.moves.map((move) => [move.pokeapiId, move.nameEn]));

  const pokemonMoves = source.pokemonMoves.flatMap((entry) => {
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

  return validateSampleMasterData({
    pokemons: source.pokemons.map((entry) => entry.pokemon),
    moves: source.moves.map(({ pokeapiId: _pokeapiId, ...move }) => move),
    items: sampleMasterData.items,
    abilities: source.abilities.map(({ pokeapiId: _pokeapiId, ...ability }) => ability),
    pokemonMoves,
    seasons: sampleMasterData.seasons,
    rules: sampleMasterData.rules,
  });
}

export const championsV1MasterData: SampleMasterData = buildChampionsMasterData({
  pokemons: championsV1SourcePokemons,
  moves: championsV1SourceMoves,
  abilities: championsV1SourceAbilities,
  pokemonMoves: championsV1SourcePokemonMoves,
});
