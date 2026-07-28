import {
  championsCurrentDeltaSourceAbilities,
  championsCurrentDeltaSourceMoves,
  championsCurrentDeltaSourcePokemonMoves,
  championsCurrentDeltaSourcePokemons,
  championsCurrentMasterData,
  championsCurrentSourceAbilities,
  championsCurrentSourceManifest,
  championsCurrentSourceMoves,
  championsCurrentSourcePokemonMoves,
  championsCurrentSourcePokemons,
} from "./champions-current-data";
import { championsV1MasterData, championsV1SourcePokemonMoves } from "./champions-v1-data";
import { validateChampionsV1DataQuality } from "./champions-v1-validation";

export interface ChampionsCurrentValidationReport {
  pokemonDelta: number;
  pokemonFinal: number;
  normalPokemonDelta: number;
  megaPokemonDelta: number;
  movesDelta: number;
  movesFinal: number;
  abilitiesDelta: number;
  abilitiesFinal: number;
  itemsDelta: number;
  itemsFinal: number;
  pokemonMovesDelta: number;
  pokemonMovesFinal: number;
  zeroMovePokemon: number;
  removedV1PokemonMoves: number;
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`MASTER-009Bデータ検収エラー: ${message}`);
  }
}

function ensureUnique(values: readonly (string | number)[], label: string): void {
  ensure(new Set(values).size === values.length, `${label}が重複しています`);
}

function relationKeys(
  groups: readonly { pokemonId: number; moveIds: readonly number[] }[],
): Set<string> {
  return new Set(
    groups.flatMap((entry) => entry.moveIds.map((moveId) => `${entry.pokemonId}:${moveId}`)),
  );
}

function sourcePokemon(pokeapiId: number) {
  const pokemon = championsCurrentSourcePokemons.find((entry) => entry.pokeapiId === pokeapiId);
  ensure(pokemon !== undefined, `PokeAPI Pokemon ID ${pokeapiId}がありません`);
  return pokemon;
}

function moveIdsByPokemonId(pokemonId: number): readonly number[] {
  return (
    championsCurrentSourcePokemonMoves.find((entry) => entry.pokemonId === pokemonId)?.moveIds ?? []
  );
}

export function validateChampionsCurrentDataQuality(): ChampionsCurrentValidationReport {
  validateChampionsV1DataQuality();

  const manifest = championsCurrentSourceManifest;
  const expectedDelta = manifest.expected;
  const expectedFinal = manifest.expectedFinal;
  const deltaPokemonIds = championsCurrentDeltaSourcePokemons.map((entry) => entry.pokeapiId);
  const finalPokemonIds = championsCurrentSourcePokemons.map((entry) => entry.pokeapiId);
  const deltaMoveIds = championsCurrentDeltaSourceMoves.map((entry) => entry.pokeapiId);
  const finalMoveIds = championsCurrentSourceMoves.map((entry) => entry.pokeapiId);
  const deltaAbilityIds = championsCurrentDeltaSourceAbilities.map((entry) => entry.pokeapiId);
  const finalAbilityIds = championsCurrentSourceAbilities.map((entry) => entry.pokeapiId);
  const deltaFormIds = championsCurrentDeltaSourcePokemons.flatMap((entry) => entry.sourceFormIds);
  const finalFormIds = championsCurrentSourcePokemons.flatMap((entry) => entry.sourceFormIds);
  const deltaRelationKeys = relationKeys(championsCurrentDeltaSourcePokemonMoves);
  const finalRelationKeys = relationKeys(championsCurrentSourcePokemonMoves);
  const v1RelationKeys = relationKeys(championsV1SourcePokemonMoves);
  const removedV1PokemonMoves = [...v1RelationKeys].filter((key) => !finalRelationKeys.has(key));

  ensure(
    manifest.source.snapshotCommit === manifest.source.learnsetCommit,
    "snapshot commit不一致",
  );
  ensure(
    manifest.source.snapshotCommit === "227b573712414a86ba299d322fa398fbb2893edc",
    "PokéAPI PR #1611固定commitが不一致です",
  );
  ensure(
    manifest.source.pokemonCommit === "522d8577237c4db0846c3694306d4f36508f19e3",
    "PokéAPI PR #1560固定commitが不一致です",
  );
  ensure(
    manifest.source.abilityCommit === "c01d35ac356c5d9ba00dfff5dcc9d8aca72b2b2b",
    "PokéAPI PR #1559固定commitが不一致です",
  );
  ensure(
    manifest.source.apiDataCommit === "bf40800cc9d1ffd04a3fc14347d2ad24d470526b",
    "api-data固定commitが不一致です",
  );
  ensure(manifest.filters.versionGroupId === 32, "Champions version groupが不一致です");
  ensure(manifest.filters.moveMethodId === 12, "Train move methodが不一致です");

  ensureUnique(deltaPokemonIds, "差分Pokemon ID");
  ensureUnique(finalPokemonIds, "最終Pokemon ID");
  ensureUnique(deltaMoveIds, "差分Move ID");
  ensureUnique(finalMoveIds, "最終Move ID");
  ensureUnique(deltaAbilityIds, "差分Ability ID");
  ensureUnique(finalAbilityIds, "最終Ability ID");
  ensureUnique(deltaFormIds, "差分Form ID");
  ensureUnique(finalFormIds, "最終Form ID");
  ensure(deltaRelationKeys.size === expectedDelta.pokemonMoves, "差分PokemonMoveが重複しています");
  ensure(finalRelationKeys.size === expectedFinal.pokemonMoves, "最終PokemonMoveが重複しています");
  ensure(removedV1PokemonMoves.length === 0, "MASTER-009AのPokemonMoveが削除されています");

  ensure(
    championsCurrentDeltaSourcePokemons.length === expectedDelta.pokemon,
    "Pokemon差分件数がmanifestと一致しません",
  );
  ensure(
    championsCurrentSourcePokemons.length === expectedFinal.pokemon,
    "Pokemon最終件数がmanifestと一致しません",
  );
  ensure(
    new Set(championsCurrentDeltaSourcePokemons.map((entry) => entry.pokeapiSpeciesId)).size ===
      expectedDelta.pokemonSpecies,
    "Pokemon species差分件数がmanifestと一致しません",
  );
  ensure(
    new Set(championsCurrentSourcePokemons.map((entry) => entry.pokeapiSpeciesId)).size ===
      expectedFinal.pokemonSpecies,
    "Pokemon species最終件数がmanifestと一致しません",
  );
  ensure(deltaFormIds.length === expectedDelta.pokemonFormRows, "Form差分件数が不一致です");
  ensure(finalFormIds.length === expectedFinal.pokemonFormRows, "Form最終件数が不一致です");
  ensure(
    championsCurrentDeltaSourcePokemons.filter((entry) => !entry.pokeapiIsDefault).length ===
      expectedDelta.nonDefaultPokemon,
    "非default Pokemon差分件数が不一致です",
  );
  ensure(
    championsCurrentSourcePokemons.filter((entry) => !entry.pokeapiIsDefault).length ===
      expectedFinal.nonDefaultPokemon,
    "非default Pokemon最終件数が不一致です",
  );
  ensure(
    championsCurrentDeltaSourcePokemons.filter((entry) => entry.pokemon.isMega).length ===
      expectedDelta.megaPokemon,
    "Mega Pokemon差分件数が不一致です",
  );
  ensure(
    championsCurrentSourcePokemons.filter((entry) => entry.pokemon.isMega).length ===
      expectedFinal.megaPokemon,
    "Mega Pokemon最終件数が不一致です",
  );
  ensure(
    championsCurrentDeltaSourceMoves.length === expectedDelta.moves,
    "Move差分件数が不一致です",
  );
  ensure(championsCurrentSourceMoves.length === expectedFinal.moves, "Move最終件数が不一致です");
  ensure(
    championsCurrentDeltaSourceAbilities.length === expectedDelta.abilities,
    "Ability差分件数が不一致です",
  );
  ensure(
    championsCurrentSourceAbilities.length === expectedFinal.abilities,
    "Ability最終件数が不一致です",
  );
  ensure(
    championsCurrentMasterData.pokemonMoves.length === expectedFinal.pokemonMoves,
    "seed入力のPokemonMove最終件数が不一致です",
  );

  const finalPokemonIdSet = new Set(finalPokemonIds);
  const finalMoveIdSet = new Set(finalMoveIds);
  const finalAbilityNameSet = new Set(championsCurrentSourceAbilities.map((entry) => entry.nameJa));
  const zeroMovePokemon = championsCurrentSourcePokemons.filter(
    (entry) => moveIdsByPokemonId(entry.pokeapiId).length === 0,
  );

  ensure(zeroMovePokemon.length === 0, "習得技0件の対象Pokemonがあります");
  ensure(
    championsCurrentSourcePokemonMoves.length === championsCurrentSourcePokemons.length,
    "PokemonとPokemonMove groupが1対1で対応していません",
  );
  for (const entry of championsCurrentSourcePokemonMoves) {
    ensure(
      finalPokemonIdSet.has(entry.pokemonId),
      `PokemonMoveのPokemon ID ${entry.pokemonId}が不明です`,
    );
    ensureUnique(entry.moveIds, `Pokemon ID ${entry.pokemonId}のMove ID`);
    for (const moveId of entry.moveIds) {
      ensure(finalMoveIdSet.has(moveId), `PokemonMoveのMove ID ${moveId}が不明です`);
    }
  }
  for (const entry of championsCurrentSourcePokemons) {
    ensure(
      entry.pokemon.nameJa.trim().length > 0,
      `Pokemon ID ${entry.pokeapiId}の日本語名が空です`,
    );
    ensure(entry.pokemon.nameEn.trim().length > 0, `Pokemon ID ${entry.pokeapiId}の英語名が空です`);
    ensure(
      entry.pokemon.type1 !== entry.pokemon.type2,
      `Pokemon ID ${entry.pokeapiId}のタイプが重複しています`,
    );
    for (const abilityName of entry.pokemon.abilities) {
      ensure(
        finalAbilityNameSet.has(abilityName),
        `Pokemon ID ${entry.pokeapiId}のAbility「${abilityName}」が不明です`,
      );
    }
    if (entry.pokemon.isMega) {
      ensure(
        entry.pokemon.basePokemon !== null,
        `Mega Pokemon ID ${entry.pokeapiId}にbasePokemonがありません`,
      );
      const base = championsCurrentSourcePokemons.find(
        (candidate) =>
          candidate.pokemon.dexNo === entry.pokemon.basePokemon?.dexNo &&
          candidate.pokemon.form === entry.pokemon.basePokemon.form,
      );
      ensure(
        base !== undefined && !base.pokemon.isMega,
        `Mega Pokemon ID ${entry.pokeapiId}の元Pokemonが不正です`,
      );
      ensure(
        JSON.stringify(moveIdsByPokemonId(entry.pokeapiId)) ===
          JSON.stringify(moveIdsByPokemonId(base.pokeapiId)),
        `Mega Pokemon ID ${entry.pokeapiId}の習得技が元Pokemonと一致しません`,
      );
    }
  }
  for (const move of championsCurrentSourceMoves) {
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
    championsCurrentMasterData.items.length === manifest.items.final,
    "Item最終件数が方針と一致しません",
  );
  ensure(
    JSON.stringify(championsCurrentMasterData.items) ===
      JSON.stringify(championsV1MasterData.items),
    "MASTER-009BでItemが意図せず変更されています",
  );
  ensure(manifest.items.delta === 0 && !manifest.items.catalogComplete, "Item MVP方針が不正です");
  ensure(
    championsCurrentDeltaSourceAbilities.length === 9,
    "Ability差分は上流参照29件ではなく既存自然キーとの差分9件である必要があります",
  );
  ensure(
    sourcePokemon(668).sourceFormIds.join(",") === "668,10551",
    "Pyroarの上流form統合が維持されていません",
  );
  ensure(sourcePokemon(10304).pokemon.nameEn === "Mega Raichu X", "Mega Raichu Xがありません");
  ensure(sourcePokemon(10305).pokemon.nameEn === "Mega Raichu Y", "Mega Raichu Yがありません");
  ensure(moveIdsByPokemonId(45).length === 54, "Vileplumeの習得技件数が不一致です");
  ensure(moveIdsByPokemonId(1000).length === 42, "Gholdengoの習得技件数が不一致です");
  ensure(moveIdsByPokemonId(10050).length === 78, "Mega Blazikenの習得技件数が不一致です");
  ensure(
    championsCurrentDeltaSourceAbilities.some(
      (ability) => ability.pokeapiId === 312 && ability.nameJa === "うなぎのぼり",
    ),
    "Eelevateの公式日本語名補完がありません",
  );
  ensure(
    championsCurrentDeltaSourceAbilities.some(
      (ability) => ability.pokeapiId === 313 && ability.nameJa === "ほのおのたてがみ",
    ),
    "Fire Maneの公式日本語名補完がありません",
  );

  return {
    pokemonDelta: championsCurrentDeltaSourcePokemons.length,
    pokemonFinal: championsCurrentSourcePokemons.length,
    normalPokemonDelta: championsCurrentDeltaSourcePokemons.filter((entry) => !entry.pokemon.isMega)
      .length,
    megaPokemonDelta: championsCurrentDeltaSourcePokemons.filter((entry) => entry.pokemon.isMega)
      .length,
    movesDelta: championsCurrentDeltaSourceMoves.length,
    movesFinal: championsCurrentSourceMoves.length,
    abilitiesDelta: championsCurrentDeltaSourceAbilities.length,
    abilitiesFinal: championsCurrentSourceAbilities.length,
    itemsDelta: manifest.items.delta,
    itemsFinal: championsCurrentMasterData.items.length,
    pokemonMovesDelta: deltaRelationKeys.size,
    pokemonMovesFinal: finalRelationKeys.size,
    zeroMovePokemon: zeroMovePokemon.length,
    removedV1PokemonMoves: removedV1PokemonMoves.length,
  };
}
