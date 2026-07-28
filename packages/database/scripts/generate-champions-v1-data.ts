import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POKEMON_TYPES } from "@pokemon-champions/shared";
import { z } from "zod";

const JAPANESE_LANGUAGE_ID = 1;
const ENGLISH_LANGUAGE_ID = 9;

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

const manifestSchema = z
  .object({
    filters: z
      .object({
        versionGroupId: z.number().int().positive(),
        versionGroupIdentifier: z.string().min(1),
        moveMethodId: z.number().int().positive(),
        moveMethodIdentifier: z.string().min(1),
      })
      .strict(),
    expected: expectedCountsSchema,
    expectedFinal: expectedCountsSchema.optional(),
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
      .optional(),
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
  .passthrough();

const baselinePokemonSchema = z.array(
  z
    .object({
      pokeapiId: z.number().int().positive(),
    })
    .passthrough(),
);
const baselineNamedResourceSchema = z.array(
  z
    .object({
      nameEn: z.string().min(1),
    })
    .passthrough(),
);
const baselinePokemonMovesSchema = z.array(
  z
    .object({
      pokemonId: z.number().int().positive(),
      moveIds: z.array(z.number().int().positive()).min(1),
    })
    .strict(),
);

type CsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) {
    throw new Error("CSVの引用符が閉じていません");
  }
  values.push(value);
  return values;
}

function readCsv(csvRoot: string, fileName: string): CsvRow[] {
  const lines = readFileSync(resolve(csvRoot, fileName), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const headerLine = lines.shift();
  if (!headerLine) {
    throw new Error(`${fileName}にヘッダーがありません`);
  }
  const headers = parseCsvLine(headerLine);

  return lines.map((line, lineIndex) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`${fileName}:${lineIndex + 2}の列数が一致しません`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function required(row: CsvRow, field: string, context: string): string {
  const value = row[field];
  if (value === undefined || value === "") {
    throw new Error(`${context}.${field}がありません`);
  }
  return value;
}

function integer(row: CsvRow, field: string, context: string): number {
  const value = Number(required(row, field, context));
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${context}.${field}が安全な整数ではありません`);
  }
  return value;
}

function optionalInteger(row: CsvRow, field: string, context: string): number | null {
  const raw = row[field];
  if (raw === undefined || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${context}.${field}が安全な整数ではありません`);
  }
  return value;
}

function indexById(rows: readonly CsvRow[], label: string): Map<number, CsvRow> {
  const result = new Map<number, CsvRow>();
  for (const row of rows) {
    const id = integer(row, "id", label);
    if (result.has(id)) {
      throw new Error(`${label} ID ${id}が重複しています`);
    }
    result.set(id, row);
  }
  return result;
}

function groupByNumber(
  rows: readonly CsvRow[],
  field: string,
  label: string,
): Map<number, CsvRow[]> {
  const result = new Map<number, CsvRow[]>();
  for (const row of rows) {
    const id = integer(row, field, label);
    const entries = result.get(id) ?? [];
    entries.push(row);
    result.set(id, entries);
  }
  return result;
}

function localizedNames(
  rows: readonly CsvRow[],
  resourceIdField: string,
  valueField: string,
  label: string,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of rows) {
    const resourceId = integer(row, resourceIdField, label);
    const languageId = integer(row, "local_language_id", label);
    const value = row[valueField];
    if (value) {
      result.set(`${resourceId}:${languageId}`, value);
    }
  }
  return result;
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function primaryForm(forms: readonly CsvRow[], pokemonId: number): CsvRow {
  const sorted = [...forms].sort(
    (left, right) => integer(left, "id", "pokemon_forms") - integer(right, "id", "pokemon_forms"),
  );
  const primary = sorted.find((form) => form.is_default === "1") ?? sorted[0];
  if (!primary) {
    throw new Error(`Pokemon ID ${pokemonId}のformがありません`);
  }
  return primary;
}

function formIdentifier(form: CsvRow): string {
  return form.form_identifier || "normal";
}

function withoutMegaToken(value: string): string[] {
  return value.split("-").filter((token) => token.length > 0 && token !== "mega");
}

function chooseBasePokemonId(
  pokemonId: number,
  pokemonById: ReadonlyMap<number, CsvRow>,
  targetIdsBySpecies: ReadonlyMap<number, readonly number[]>,
  primaryFormByPokemonId: ReadonlyMap<number, CsvRow>,
): number | null {
  const pokemon = pokemonById.get(pokemonId);
  const form = primaryFormByPokemonId.get(pokemonId);
  if (!pokemon || !form) {
    throw new Error(`Pokemon ID ${pokemonId}を解決できません`);
  }
  const isMega = form.is_mega === "1";
  if (!isMega && pokemon.is_default === "1") {
    return null;
  }

  const speciesId = integer(pokemon, "species_id", "pokemon");
  const candidates = (targetIdsBySpecies.get(speciesId) ?? []).filter((candidateId) => {
    if (candidateId === pokemonId) {
      return false;
    }
    const candidateForm = primaryFormByPokemonId.get(candidateId);
    return candidateForm?.is_mega !== "1";
  });

  if (!isMega) {
    return (
      candidates.find((candidateId) => pokemonById.get(candidateId)?.is_default === "1") ?? null
    );
  }

  const qualifiers = withoutMegaToken(formIdentifier(form));
  if (qualifiers.length > 0) {
    const qualifierMatches = candidates.filter((candidateId) => {
      const candidateForm = primaryFormByPokemonId.get(candidateId);
      if (!candidateForm) {
        return false;
      }
      const candidateTokens = new Set(formIdentifier(candidateForm).split("-"));
      return qualifiers.every((qualifier) => candidateTokens.has(qualifier));
    });
    if (qualifierMatches.length === 1) {
      return qualifierMatches[0] ?? null;
    }
  }

  const defaultCandidate = candidates.find(
    (candidateId) => pokemonById.get(candidateId)?.is_default === "1",
  );
  if (defaultCandidate !== undefined) {
    return defaultCandidate;
  }
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  throw new Error(`Mega Pokemon ID ${pokemonId}の元ポケモンを一意に解決できません`);
}

function main(): void {
  const csvRootArgument = process.argv[2];
  if (!csvRootArgument) {
    throw new Error(
      "使用方法: pnpm --filter @pokemon-champions/database exec tsx scripts/generate-champions-v1-data.ts <pokeapi/data/v2/csv>",
    );
  }
  const csvRoot = resolve(csvRootArgument);
  const outputRoot = process.argv[3]
    ? resolve(process.argv[3])
    : fileURLToPath(new URL("../src/seed/data/champions-v1/", import.meta.url));
  const baselineRoot = process.argv[4] ? resolve(process.argv[4]) : null;
  const manifestPath = resolve(outputRoot, "source-manifest.json");
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));

  for (const sourceFile of manifest.files) {
    const actualHash = sha256(resolve(csvRoot, sourceFile.path));
    if (actualHash !== sourceFile.sha256) {
      throw new Error(`${sourceFile.path}のSHA-256が固定manifestと一致しません: ${actualHash}`);
    }
  }

  const versionGroups = readCsv(csvRoot, "version_groups.csv");
  const moveMethods = readCsv(csvRoot, "pokemon_move_methods.csv");
  const versionGroup = versionGroups.find(
    (row) => integer(row, "id", "version_groups") === manifest.filters.versionGroupId,
  );
  const moveMethod = moveMethods.find(
    (row) => integer(row, "id", "pokemon_move_methods") === manifest.filters.moveMethodId,
  );
  if (versionGroup?.identifier !== manifest.filters.versionGroupIdentifier) {
    throw new Error("Champions version groupが固定manifestと一致しません");
  }
  if (moveMethod?.identifier !== manifest.filters.moveMethodIdentifier) {
    throw new Error("Train move methodが固定manifestと一致しません");
  }

  const pokemonMoves = readCsv(csvRoot, "pokemon_moves.csv")
    .filter(
      (row) =>
        integer(row, "version_group_id", "pokemon_moves") === manifest.filters.versionGroupId &&
        integer(row, "pokemon_move_method_id", "pokemon_moves") === manifest.filters.moveMethodId,
    )
    .map((row) => ({
      pokemonId: integer(row, "pokemon_id", "pokemon_moves"),
      moveId: integer(row, "move_id", "pokemon_moves"),
    }))
    .sort((left, right) => left.pokemonId - right.pokemonId || left.moveId - right.moveId);

  const targetPokemonIds = new Set(pokemonMoves.map((entry) => entry.pokemonId));
  const targetMoveIds = new Set(pokemonMoves.map((entry) => entry.moveId));
  const pokemonById = indexById(readCsv(csvRoot, "pokemon.csv"), "pokemon");
  const pokemonFormsByPokemonId = groupByNumber(
    readCsv(csvRoot, "pokemon_forms.csv"),
    "pokemon_id",
    "pokemon_forms",
  );
  const primaryFormByPokemonId = new Map(
    [...targetPokemonIds].map((pokemonId) => [
      pokemonId,
      primaryForm(pokemonFormsByPokemonId.get(pokemonId) ?? [], pokemonId),
    ]),
  );
  const targetIdsBySpecies = new Map<number, number[]>();
  for (const pokemonId of targetPokemonIds) {
    const pokemon = pokemonById.get(pokemonId);
    if (!pokemon) {
      throw new Error(`Pokemon ID ${pokemonId}がpokemon.csvにありません`);
    }
    const speciesId = integer(pokemon, "species_id", "pokemon");
    const entries = targetIdsBySpecies.get(speciesId) ?? [];
    entries.push(pokemonId);
    targetIdsBySpecies.set(speciesId, entries);
  }

  const speciesNames = localizedNames(
    readCsv(csvRoot, "pokemon_species_names.csv"),
    "pokemon_species_id",
    "name",
    "pokemon_species_names",
  );
  const formNames = readCsv(csvRoot, "pokemon_form_names.csv");
  const formNameByKey = new Map<string, CsvRow>();
  for (const formName of formNames) {
    const formId = integer(formName, "pokemon_form_id", "pokemon_form_names");
    const languageId = integer(formName, "local_language_id", "pokemon_form_names");
    formNameByKey.set(`${formId}:${languageId}`, formName);
  }
  const statIdentifiers = new Map(
    readCsv(csvRoot, "stats.csv").map((row) => [
      integer(row, "id", "stats"),
      required(row, "identifier", "stats"),
    ]),
  );
  const statsByPokemonId = groupByNumber(
    readCsv(csvRoot, "pokemon_stats.csv"),
    "pokemon_id",
    "pokemon_stats",
  );
  const typeIdentifiers = new Map(
    readCsv(csvRoot, "types.csv").map((row) => [
      integer(row, "id", "types"),
      required(row, "identifier", "types"),
    ]),
  );
  const typesByPokemonId = groupByNumber(
    readCsv(csvRoot, "pokemon_types.csv"),
    "pokemon_id",
    "pokemon_types",
  );
  const abilitiesByPokemonId = groupByNumber(
    readCsv(csvRoot, "pokemon_abilities.csv"),
    "pokemon_id",
    "pokemon_abilities",
  );
  const abilityById = indexById(readCsv(csvRoot, "abilities.csv"), "abilities");
  const abilityNames = localizedNames(
    readCsv(csvRoot, "ability_names.csv"),
    "ability_id",
    "name",
    "ability_names",
  );
  for (const override of manifest.localizedAbilityNameOverrides ?? []) {
    const key = `${override.pokeapiId}:${JAPANESE_LANGUAGE_ID}`;
    if (abilityNames.has(key)) {
      throw new Error(`Ability ID ${override.pokeapiId}の日本語名は上流CSVに既に存在します`);
    }
    abilityNames.set(key, override.nameJa);
  }

  const targetAbilityIds = new Set<number>();
  const pokemonOutput = [...targetPokemonIds]
    .sort((left, right) => left - right)
    .map((pokemonId) => {
      const pokemon = pokemonById.get(pokemonId);
      const form = primaryFormByPokemonId.get(pokemonId);
      if (!pokemon || !form) {
        throw new Error(`Pokemon ID ${pokemonId}を変換できません`);
      }
      const speciesId = integer(pokemon, "species_id", "pokemon");
      const sourceForms = [...(pokemonFormsByPokemonId.get(pokemonId) ?? [])].sort(
        (left, right) =>
          integer(left, "id", "pokemon_forms") - integer(right, "id", "pokemon_forms"),
      );
      const sourceFormIds = sourceForms.map((entry) => integer(entry, "id", "pokemon_forms"));
      const formId = integer(form, "id", "pokemon_forms");
      const japaneseSpeciesName = speciesNames.get(`${speciesId}:${JAPANESE_LANGUAGE_ID}`);
      const englishSpeciesName = speciesNames.get(`${speciesId}:${ENGLISH_LANGUAGE_ID}`);
      if (!japaneseSpeciesName || !englishSpeciesName) {
        throw new Error(`Species ID ${speciesId}の日本語名または英語名がありません`);
      }
      const japaneseFormName = formNameByKey.get(`${formId}:${JAPANESE_LANGUAGE_ID}`)?.form_name;
      const englishFormName = formNameByKey.get(`${formId}:${ENGLISH_LANGUAGE_ID}`);
      const isMega = form.is_mega === "1";
      const basePokemonId = chooseBasePokemonId(
        pokemonId,
        pokemonById,
        targetIdsBySpecies,
        primaryFormByPokemonId,
      );
      const basePokemon = basePokemonId
        ? {
            dexNo: integer(pokemonById.get(basePokemonId) ?? {}, "species_id", "base pokemon"),
            form: formIdentifier(
              primaryFormByPokemonId.get(basePokemonId) ??
                (() => {
                  throw new Error(`Base Pokemon ID ${basePokemonId}のformがありません`);
                })(),
            ),
          }
        : null;

      const pokemonStats = new Map(
        (statsByPokemonId.get(pokemonId) ?? []).map((entry) => {
          const statId = integer(entry, "stat_id", "pokemon_stats");
          const identifier = statIdentifiers.get(statId);
          if (!identifier) {
            throw new Error(`Stat ID ${statId}がありません`);
          }
          return [identifier, integer(entry, "base_stat", "pokemon_stats")];
        }),
      );
      const pokemonTypes = [...(typesByPokemonId.get(pokemonId) ?? [])]
        .sort(
          (left, right) =>
            integer(left, "slot", "pokemon_types") - integer(right, "slot", "pokemon_types"),
        )
        .map((entry) => {
          const typeId = integer(entry, "type_id", "pokemon_types");
          const identifier = typeIdentifiers.get(typeId);
          if (
            !identifier ||
            !POKEMON_TYPES.includes(identifier as (typeof POKEMON_TYPES)[number])
          ) {
            throw new Error(`Pokemon ID ${pokemonId}のType ID ${typeId}は現行18タイプ外です`);
          }
          return identifier;
        });
      if (pokemonTypes.length < 1 || pokemonTypes.length > 2) {
        throw new Error(`Pokemon ID ${pokemonId}のタイプ数が不正です`);
      }

      const abilities = [...(abilitiesByPokemonId.get(pokemonId) ?? [])]
        .sort(
          (left, right) =>
            integer(left, "slot", "pokemon_abilities") -
              integer(right, "slot", "pokemon_abilities") ||
            integer(left, "ability_id", "pokemon_abilities") -
              integer(right, "ability_id", "pokemon_abilities"),
        )
        .map((entry) => {
          const abilityId = integer(entry, "ability_id", "pokemon_abilities");
          targetAbilityIds.add(abilityId);
          const name = abilityNames.get(`${abilityId}:${JAPANESE_LANGUAGE_ID}`);
          if (!name) {
            throw new Error(`Ability ID ${abilityId}の日本語名がありません`);
          }
          return name;
        });
      if (abilities.length === 0 || new Set(abilities).size !== abilities.length) {
        throw new Error(`Pokemon ID ${pokemonId}の特性が空または重複しています`);
      }

      const getStat = (identifier: string): number => {
        const value = pokemonStats.get(identifier);
        if (value === undefined) {
          throw new Error(`Pokemon ID ${pokemonId}の${identifier}がありません`);
        }
        return value;
      };

      return {
        pokeapiId: pokemonId,
        pokeapiSpeciesId: speciesId,
        pokeapiIsDefault: pokemon.is_default === "1",
        sourceFormIds,
        pokemon: {
          dexNo: speciesId,
          nameJa: isMega && japaneseFormName ? japaneseFormName : japaneseSpeciesName,
          nameEn:
            englishFormName?.pokemon_name ||
            (isMega ? englishFormName?.form_name : undefined) ||
            englishSpeciesName,
          form: formIdentifier(form),
          type1: pokemonTypes[0],
          type2: pokemonTypes[1] ?? null,
          baseHp: getStat("hp"),
          baseAtk: getStat("attack"),
          baseDef: getStat("defense"),
          baseSpa: getStat("special-attack"),
          baseSpd: getStat("special-defense"),
          baseSpe: getStat("speed"),
          abilities,
          isMega,
          basePokemon,
        },
      };
    });

  const moveById = indexById(readCsv(csvRoot, "moves.csv"), "moves");
  const moveNames = localizedNames(
    readCsv(csvRoot, "move_names.csv"),
    "move_id",
    "name",
    "move_names",
  );
  const damageClasses = new Map(
    readCsv(csvRoot, "move_damage_classes.csv").map((row) => [
      integer(row, "id", "move_damage_classes"),
      required(row, "identifier", "move_damage_classes"),
    ]),
  );
  const moveOutput = [...targetMoveIds]
    .sort((left, right) => left - right)
    .map((moveId) => {
      const move = moveById.get(moveId);
      if (!move) {
        throw new Error(`Move ID ${moveId}がmoves.csvにありません`);
      }
      const typeId = integer(move, "type_id", "moves");
      const type = typeIdentifiers.get(typeId);
      if (!type || !POKEMON_TYPES.includes(type as (typeof POKEMON_TYPES)[number])) {
        throw new Error(`Move ID ${moveId}のType ID ${typeId}は現行18タイプ外です`);
      }
      const damageClassId = integer(move, "damage_class_id", "moves");
      const category = damageClasses.get(damageClassId);
      if (!category || !["physical", "special", "status"].includes(category)) {
        throw new Error(`Move ID ${moveId}の分類が不正です`);
      }
      const nameJa = moveNames.get(`${moveId}:${JAPANESE_LANGUAGE_ID}`);
      const nameEn = moveNames.get(`${moveId}:${ENGLISH_LANGUAGE_ID}`);
      if (!nameJa || !nameEn) {
        throw new Error(`Move ID ${moveId}の日本語名または英語名がありません`);
      }
      const sourcePower = optionalInteger(move, "power", "moves");
      const sourceAccuracy = optionalInteger(move, "accuracy", "moves");
      const priority = integer(move, "priority", "moves");
      return {
        pokeapiId: moveId,
        nameJa,
        nameEn,
        type,
        category,
        power: sourcePower !== null && sourcePower > 0 ? sourcePower : null,
        accuracy: sourceAccuracy !== null && sourceAccuracy > 0 ? sourceAccuracy : null,
        priority,
        tags: priority > 0 ? ["priority"] : [],
      };
    });

  const abilityOutput = [...targetAbilityIds]
    .sort((left, right) => left - right)
    .map((abilityId) => {
      const ability = abilityById.get(abilityId);
      const nameJa = abilityNames.get(`${abilityId}:${JAPANESE_LANGUAGE_ID}`);
      const nameEn = abilityNames.get(`${abilityId}:${ENGLISH_LANGUAGE_ID}`);
      if (!ability || !nameJa || !nameEn) {
        throw new Error(`Ability ID ${abilityId}の基本情報または名称がありません`);
      }
      return {
        pokeapiId: abilityId,
        nameJa,
        nameEn,
        effectTags: [],
      };
    });

  const pokemonMoveOutput = [...targetPokemonIds]
    .sort((left, right) => left - right)
    .map((pokemonId) => ({
      pokemonId,
      moveIds: pokemonMoves
        .filter((entry) => entry.pokemonId === pokemonId)
        .map((entry) => entry.moveId),
    }));

  const finalActual = {
    pokemon: pokemonOutput.length,
    pokemonSpecies: new Set(pokemonOutput.map((entry) => entry.pokeapiSpeciesId)).size,
    pokemonFormRows: pokemonOutput.reduce((total, entry) => total + entry.sourceFormIds.length, 0),
    nonDefaultPokemon: pokemonOutput.filter((entry) => !entry.pokeapiIsDefault).length,
    megaPokemon: pokemonOutput.filter((entry) => entry.pokemon.isMega).length,
    moves: moveOutput.length,
    abilities: abilityOutput.length,
    pokemonMoves: pokemonMoves.length,
  };

  let outputPokemons = pokemonOutput;
  let outputMoves = moveOutput;
  let outputAbilities = abilityOutput;
  let outputPokemonMoves = pokemonMoveOutput;

  if (baselineRoot !== null) {
    const baselinePokemons = baselinePokemonSchema.parse(
      loadJson(resolve(baselineRoot, "pokemons.json")),
    );
    const baselineMoves = baselineNamedResourceSchema.parse(
      loadJson(resolve(baselineRoot, "moves.json")),
    );
    const baselineAbilities = baselineNamedResourceSchema.parse(
      loadJson(resolve(baselineRoot, "abilities.json")),
    );
    const baselinePokemonMoves = baselinePokemonMovesSchema.parse(
      loadJson(resolve(baselineRoot, "pokemon-moves.json")),
    );
    const baselinePokemonIds = new Set(baselinePokemons.map((entry) => entry.pokeapiId));
    const baselineMoveNames = new Set(baselineMoves.map((entry) => entry.nameEn));
    const baselineAbilityNames = new Set(baselineAbilities.map((entry) => entry.nameEn));
    const baselineRelationKeys = new Set(
      baselinePokemonMoves.flatMap((entry) =>
        entry.moveIds.map((moveId) => `${entry.pokemonId}:${moveId}`),
      ),
    );
    const finalRelationKeys = new Set(
      pokemonMoveOutput.flatMap((entry) =>
        entry.moveIds.map((moveId) => `${entry.pokemonId}:${moveId}`),
      ),
    );
    const removedBaselineRelations = [...baselineRelationKeys].filter(
      (relationKey) => !finalRelationKeys.has(relationKey),
    );
    if (removedBaselineRelations.length > 0) {
      throw new Error(
        `基準snapshotから削除されたPokemonMoveがあります: ${removedBaselineRelations.length}件`,
      );
    }

    outputPokemons = pokemonOutput.filter((entry) => !baselinePokemonIds.has(entry.pokeapiId));
    outputMoves = moveOutput.filter((entry) => !baselineMoveNames.has(entry.nameEn));
    outputAbilities = abilityOutput.filter((entry) => !baselineAbilityNames.has(entry.nameEn));
    outputPokemonMoves = pokemonMoveOutput
      .map((entry) => ({
        pokemonId: entry.pokemonId,
        moveIds: entry.moveIds.filter(
          (moveId) => !baselineRelationKeys.has(`${entry.pokemonId}:${moveId}`),
        ),
      }))
      .filter((entry) => entry.moveIds.length > 0);
  }

  const actual = {
    pokemon: outputPokemons.length,
    pokemonSpecies: new Set(outputPokemons.map((entry) => entry.pokeapiSpeciesId)).size,
    pokemonFormRows: outputPokemons.reduce((total, entry) => total + entry.sourceFormIds.length, 0),
    nonDefaultPokemon: outputPokemons.filter((entry) => !entry.pokeapiIsDefault).length,
    megaPokemon: outputPokemons.filter((entry) => entry.pokemon.isMega).length,
    moves: outputMoves.length,
    abilities: outputAbilities.length,
    pokemonMoves: outputPokemonMoves.reduce((total, entry) => total + entry.moveIds.length, 0),
  };
  for (const [key, value] of Object.entries(actual)) {
    const expected = manifest.expected[key as keyof typeof actual];
    if (value !== expected) {
      throw new Error(`${key}件数が固定manifestと一致しません: ${value} !== ${expected}`);
    }
  }
  if (manifest.expectedFinal) {
    for (const [key, value] of Object.entries(finalActual)) {
      const expected = manifest.expectedFinal[key as keyof typeof finalActual];
      if (value !== expected) {
        throw new Error(`最終${key}件数が固定manifestと一致しません: ${value} !== ${expected}`);
      }
    }
  }

  writeJson(resolve(outputRoot, "pokemons.json"), outputPokemons);
  writeJson(resolve(outputRoot, "moves.json"), outputMoves);
  writeJson(resolve(outputRoot, "abilities.json"), outputAbilities);
  writeJson(resolve(outputRoot, "pokemon-moves.json"), outputPokemonMoves);

  console.log(
    `✅ Champions data generated: Pokemon=${actual.pokemon}, Move=${actual.moves}, Ability=${actual.abilities}, PokemonMove=${actual.pokemonMoves}`,
  );
}

main();
