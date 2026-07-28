import {
  championsV1MasterData,
  championsV1SourceAbilities,
  championsV1SourceManifest,
  championsV1SourceMoves,
  championsV1SourcePokemonMoves,
  championsV1SourcePokemons,
} from "./champions-v1-data";

export interface ChampionsV1ValidationReport {
  pokemon: number;
  pokemonSpecies: number;
  pokemonFormRows: number;
  nonDefaultPokemon: number;
  megaPokemon: number;
  moves: number;
  items: number;
  abilities: number;
  pokemonMoves: number;
  zeroMovePokemon: number;
  maximumMovesPerPokemon: number;
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`MASTER-009Aデータ検収エラー: ${message}`);
  }
}

function ensureUnique(values: readonly (string | number)[], label: string): void {
  ensure(new Set(values).size === values.length, `${label}が重複しています`);
}

function moveCountByPokemonId(pokemonId: number): number {
  return (
    championsV1SourcePokemonMoves.find((entry) => entry.pokemonId === pokemonId)?.moveIds.length ??
    0
  );
}

function moveIdsByPokemonId(pokemonId: number): readonly number[] {
  return (
    championsV1SourcePokemonMoves.find((entry) => entry.pokemonId === pokemonId)?.moveIds ?? []
  );
}

function sourcePokemon(pokeapiId: number) {
  const result = championsV1SourcePokemons.find((entry) => entry.pokeapiId === pokeapiId);
  ensure(result !== undefined, `PokeAPI Pokemon ID ${pokeapiId}がありません`);
  return result;
}

export function validateChampionsV1DataQuality(): ChampionsV1ValidationReport {
  const expected = championsV1SourceManifest.expected;
  const pokemonIds = championsV1SourcePokemons.map((entry) => entry.pokeapiId);
  const moveIds = championsV1SourceMoves.map((entry) => entry.pokeapiId);
  const abilityIds = championsV1SourceAbilities.map((entry) => entry.pokeapiId);
  const relationPokemonIds = championsV1SourcePokemonMoves.map((entry) => entry.pokemonId);
  const sourceFormIds = championsV1SourcePokemons.flatMap((entry) => entry.sourceFormIds);
  const relationCount = championsV1SourcePokemonMoves.reduce(
    (total, entry) => total + entry.moveIds.length,
    0,
  );
  const zeroMovePokemon = championsV1SourcePokemons.filter(
    (entry) => moveCountByPokemonId(entry.pokeapiId) === 0,
  );
  const maximumMovesPerPokemon = Math.max(
    ...championsV1SourcePokemonMoves.map((entry) => entry.moveIds.length),
  );

  ensureUnique(pokemonIds, "PokeAPI Pokemon ID");
  ensureUnique(moveIds, "PokeAPI Move ID");
  ensureUnique(abilityIds, "PokeAPI Ability ID");
  ensureUnique(relationPokemonIds, "PokemonMoveのPokemon ID");
  ensureUnique(sourceFormIds, "PokeAPI Form ID");
  ensure(
    championsV1SourcePokemons.length === expected.pokemon,
    `Pokemon件数 ${championsV1SourcePokemons.length} != ${expected.pokemon}`,
  );
  ensure(
    new Set(championsV1SourcePokemons.map((entry) => entry.pokeapiSpeciesId)).size ===
      expected.pokemonSpecies,
    "Pokemon species件数が固定manifestと一致しません",
  );
  ensure(sourceFormIds.length === expected.pokemonFormRows, "form行件数が一致しません");
  ensure(
    championsV1SourcePokemons.filter((entry) => !entry.pokeapiIsDefault).length ===
      expected.nonDefaultPokemon,
    "非default Pokemon件数が一致しません",
  );
  ensure(
    championsV1SourcePokemons.filter((entry) => entry.pokemon.isMega).length ===
      expected.megaPokemon,
    "Mega Pokemon件数が一致しません",
  );
  ensure(championsV1SourceMoves.length === expected.moves, "Move件数が一致しません");
  ensure(championsV1SourceAbilities.length === expected.abilities, "Ability件数が一致しません");
  ensure(relationCount === expected.pokemonMoves, "PokemonMove件数が一致しません");
  ensure(zeroMovePokemon.length === 0, "習得技0件の対象Pokemonがあります");
  ensure(
    new Set(relationPokemonIds).size === championsV1SourcePokemons.length,
    "PokemonとPokemonMove groupが1対1で対応していません",
  );

  const pokemonIdSet = new Set(pokemonIds);
  const moveIdSet = new Set(moveIds);
  const abilityNameSet = new Set(championsV1SourceAbilities.map((entry) => entry.nameJa));
  for (const entry of championsV1SourcePokemonMoves) {
    ensure(
      pokemonIdSet.has(entry.pokemonId),
      `PokemonMoveのPokemon ID ${entry.pokemonId}が不明です`,
    );
    ensureUnique(entry.moveIds, `Pokemon ID ${entry.pokemonId}のMove ID`);
    for (const moveId of entry.moveIds) {
      ensure(moveIdSet.has(moveId), `PokemonMoveのMove ID ${moveId}が不明です`);
    }
  }
  for (const entry of championsV1SourcePokemons) {
    ensure(
      entry.pokemon.type1 !== entry.pokemon.type2,
      `Pokemon ID ${entry.pokeapiId}のタイプが重複しています`,
    );
    for (const abilityName of entry.pokemon.abilities) {
      ensure(
        abilityNameSet.has(abilityName),
        `Pokemon ID ${entry.pokeapiId}のAbility「${abilityName}」が不明です`,
      );
    }
    if (entry.pokemon.isMega) {
      ensure(
        entry.pokemon.basePokemon !== null,
        `Mega Pokemon ID ${entry.pokeapiId}にbasePokemonがありません`,
      );
    }
  }
  for (const move of championsV1SourceMoves) {
    ensure(
      move.tags.length === 0 || (move.tags.length === 1 && move.tags[0] === "priority"),
      `Move ID ${move.pokeapiId}に推測タグがあります`,
    );
    ensure(
      (move.priority > 0 && move.tags[0] === "priority") ||
        (move.priority <= 0 && move.tags.length === 0),
      `Move ID ${move.pokeapiId}のpriorityタグが数値と一致しません`,
    );
  }
  ensure(
    maximumMovesPerPokemon < championsV1SourceMoves.length,
    "全MoveをPokemonへ無条件に紐付けた可能性があります",
  );
  ensure(
    championsV1MasterData.pokemonMoves.length === expected.pokemonMoves,
    "seed入力のPokemonMove件数がsourceと一致しません",
  );

  ensure(moveCountByPokemonId(130) === 67, "Gyaradosの代表習得技件数が不一致です");
  ensure(moveCountByPokemonId(10041) === 67, "Mega Gyaradosの代表習得技件数が不一致です");
  ensure(moveCountByPokemonId(450) === 51, "Hippowdonの代表習得技件数が不一致です");
  ensure(moveCountByPokemonId(887) === 63, "Dragapultの代表習得技件数が不一致です");
  ensure(moveCountByPokemonId(877) === 65, "Morpeko Full Bellyの習得技件数が不一致です");
  ensure(moveCountByPokemonId(10187) === 60, "Morpeko Hangryの習得技件数が不一致です");
  ensure(
    JSON.stringify(moveIdsByPokemonId(678)) === JSON.stringify(moveIdsByPokemonId(10314)),
    "Meowstic♂とMega Meowstic♂の習得技が一致しません",
  );
  ensure(
    JSON.stringify(moveIdsByPokemonId(10025)) === JSON.stringify(moveIdsByPokemonId(10326)),
    "Meowstic♀とMega Meowstic♀の習得技が一致しません",
  );
  ensure(sourcePokemon(666).sourceFormIds.length === 20, "Vivillonのform統合数が不一致です");
  ensure(sourcePokemon(671).sourceFormIds.length === 5, "Florgesのform統合数が不一致です");
  ensure(sourcePokemon(676).sourceFormIds.length === 10, "Furfrouのform統合数が不一致です");
  ensure(sourcePokemon(855).sourceFormIds.length === 2, "Polteageistのform統合数が不一致です");
  ensure(sourcePokemon(869).sourceFormIds.length === 63, "Alcremieのform統合数が不一致です");
  ensure(sourcePokemon(1013).sourceFormIds.length === 2, "Sinistchaのform統合数が不一致です");
  ensure(
    sourcePokemon(10314).pokemon.form === "mega-male" &&
      sourcePokemon(10326).pokemon.form === "mega-female",
    "Mega Meowsticの男女formが分離されていません",
  );

  return {
    pokemon: championsV1SourcePokemons.length,
    pokemonSpecies: expected.pokemonSpecies,
    pokemonFormRows: sourceFormIds.length,
    nonDefaultPokemon: expected.nonDefaultPokemon,
    megaPokemon: expected.megaPokemon,
    moves: championsV1SourceMoves.length,
    items: championsV1MasterData.items.length,
    abilities: championsV1SourceAbilities.length,
    pokemonMoves: relationCount,
    zeroMovePokemon: zeroMovePokemon.length,
    maximumMovesPerPokemon,
  };
}
