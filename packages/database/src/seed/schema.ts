import {
  abilityMasterSchema,
  itemMasterSchema,
  moveMasterSchema,
  pokemonAbilitiesSchema,
  ruleMasterSchema,
  seasonMasterSchema,
} from "@pokemon-champions/shared";
import { z } from "zod";

const requiredTextSchema = z.string().trim().min(1, "1文字以上指定してください");
const baseStatSchema = z.number().int().min(1).max(255);

export const pokemonReferenceSchema = z
  .object({
    dexNo: z.number().int().positive(),
    form: requiredTextSchema,
  })
  .strict();

export const pokemonSeedSchema = z
  .object({
    dexNo: z.number().int().positive(),
    nameJa: requiredTextSchema,
    nameEn: requiredTextSchema,
    form: requiredTextSchema,
    type1: requiredTextSchema,
    type2: requiredTextSchema.nullable(),
    baseHp: baseStatSchema,
    baseAtk: baseStatSchema,
    baseDef: baseStatSchema,
    baseSpa: baseStatSchema,
    baseSpd: baseStatSchema,
    baseSpe: baseStatSchema,
    abilities: pokemonAbilitiesSchema,
    isMega: z.boolean(),
    basePokemon: pokemonReferenceSchema.nullable(),
  })
  .strict()
  .superRefine((pokemon, context) => {
    if (pokemon.type2 === pokemon.type1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "複合タイプに同じタイプは指定できません",
        path: ["type2"],
      });
    }
    if (pokemon.isMega && pokemon.basePokemon === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "メガ形態には元ポケモンが必要です",
        path: ["basePokemon"],
      });
    }
    if (pokemon.basePokemon?.dexNo === pokemon.dexNo && pokemon.basePokemon.form === pokemon.form) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自分自身を元ポケモンには指定できません",
        path: ["basePokemon"],
      });
    }
  });

export const pokemonMoveReferenceSchema = z
  .object({
    pokemon: pokemonReferenceSchema,
    moveNameEn: requiredTextSchema,
  })
  .strict();

const sampleMasterDataBaseSchema = z
  .object({
    pokemons: z.array(pokemonSeedSchema).min(4),
    moves: z.array(moveMasterSchema).min(5),
    items: z.array(itemMasterSchema).min(3),
    abilities: z.array(abilityMasterSchema).min(3),
    pokemonMoves: z.array(pokemonMoveReferenceSchema).min(5),
    seasons: z.array(seasonMasterSchema).min(1),
    rules: z.array(ruleMasterSchema).min(1),
  })
  .strict();

type ValidationContext = z.RefinementCtx;
type PokemonReference = z.infer<typeof pokemonReferenceSchema>;
type SampleMasterDataBase = z.infer<typeof sampleMasterDataBaseSchema>;

function pokemonKey(reference: PokemonReference): string {
  return JSON.stringify([reference.dexNo, reference.form]);
}

function addDuplicateIssues(
  values: readonly string[],
  pathPrefix: string,
  fieldName: string,
  context: ValidationContext,
): void {
  const firstIndexByValue = new Map<string, number>();

  values.forEach((value, index) => {
    const firstIndex = firstIndexByValue.get(value);
    if (firstIndex !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${fieldName}が重複しています（最初の位置: ${firstIndex}）`,
        path: [pathPrefix, index],
      });
      return;
    }
    firstIndexByValue.set(value, index);
  });
}

function validateUniqueKeys(data: SampleMasterDataBase, context: ValidationContext): void {
  addDuplicateIssues(
    data.pokemons.map(pokemonKey),
    "pokemons",
    "図鑑番号とフォルムの組み合わせ",
    context,
  );

  for (const [collection, entries] of [
    ["moves", data.moves],
    ["items", data.items],
    ["abilities", data.abilities],
  ] as const) {
    addDuplicateIssues(
      entries.map((entry) => entry.nameJa),
      collection,
      "日本語名",
      context,
    );
    addDuplicateIssues(
      entries.map((entry) => entry.nameEn),
      collection,
      "英語名",
      context,
    );
  }

  addDuplicateIssues(
    data.seasons.map((season) => season.name),
    "seasons",
    "シーズン名",
    context,
  );
  addDuplicateIssues(
    data.rules.map((rule) => rule.name),
    "rules",
    "ルール名",
    context,
  );
  addDuplicateIssues(
    data.pokemonMoves.map(
      (pokemonMove) => `${pokemonKey(pokemonMove.pokemon)}:${pokemonMove.moveNameEn}`,
    ),
    "pokemonMoves",
    "ポケモンと技の組み合わせ",
    context,
  );
}

function validatePokemonReferences(data: SampleMasterDataBase, context: ValidationContext): void {
  const pokemonByKey = new Map(data.pokemons.map((pokemon) => [pokemonKey(pokemon), pokemon]));
  const abilityNames = new Set(data.abilities.map((ability) => ability.nameJa));

  data.pokemons.forEach((pokemon, index) => {
    for (const ability of pokemon.abilities) {
      if (!abilityNames.has(ability)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `特性「${ability}」がabilitiesに存在しません`,
          path: ["pokemons", index, "abilities"],
        });
      }
    }

    if (pokemon.basePokemon === null) {
      return;
    }

    const basePokemon = pokemonByKey.get(pokemonKey(pokemon.basePokemon));
    if (!basePokemon) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "元ポケモンがpokemonsに存在しません",
        path: ["pokemons", index, "basePokemon"],
      });
    } else if (pokemon.isMega && basePokemon.isMega) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "メガ形態の元ポケモンには通常形態を指定してください",
        path: ["pokemons", index, "basePokemon"],
      });
    }
  });

  data.pokemons.forEach((pokemon, index) => {
    const visited = new Set<string>();
    let current: typeof pokemon | undefined = pokemon;

    while (current?.basePokemon) {
      const currentKey = pokemonKey(current);
      if (visited.has(currentKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "元ポケモンの参照が循環しています",
          path: ["pokemons", index, "basePokemon"],
        });
        break;
      }
      visited.add(currentKey);
      current = pokemonByKey.get(pokemonKey(current.basePokemon));
    }
  });
}

function validatePokemonMoves(data: SampleMasterDataBase, context: ValidationContext): void {
  const pokemonKeys = new Set(data.pokemons.map(pokemonKey));
  const moveNames = new Set(data.moves.map((move) => move.nameEn));

  data.pokemonMoves.forEach((pokemonMove, index) => {
    if (!pokemonKeys.has(pokemonKey(pokemonMove.pokemon))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "関連先ポケモンがpokemonsに存在しません",
        path: ["pokemonMoves", index, "pokemon"],
      });
    }
    if (!moveNames.has(pokemonMove.moveNameEn)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `関連先技「${pokemonMove.moveNameEn}」がmovesに存在しません`,
        path: ["pokemonMoves", index, "moveNameEn"],
      });
    }
  });
}

export const sampleMasterDataSchema = sampleMasterDataBaseSchema.superRefine((data, context) => {
  const normalCount = data.pokemons.filter((pokemon) => !pokemon.isMega).length;
  const megaCount = data.pokemons.filter((pokemon) => pokemon.isMega).length;

  if (normalCount < 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "通常ポケモンを3体以上指定してください",
      path: ["pokemons"],
    });
  }
  if (megaCount < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "メガ形態を1体以上指定してください",
      path: ["pokemons"],
    });
  }

  validateUniqueKeys(data, context);
  validatePokemonReferences(data, context);
  validatePokemonMoves(data, context);
});

export type PokemonSeed = z.infer<typeof pokemonSeedSchema>;
export type SampleMasterData = z.infer<typeof sampleMasterDataSchema>;

export function validateSampleMasterData(input: unknown): SampleMasterData {
  return sampleMasterDataSchema.parse(input);
}

export function getPokemonSeedKey(reference: PokemonReference): string {
  return pokemonKey(reference);
}

export function orderPokemonsByBaseForm(pokemons: readonly PokemonSeed[]): PokemonSeed[] {
  const remaining = new Map(pokemons.map((pokemon) => [pokemonKey(pokemon), pokemon]));
  const ordered: PokemonSeed[] = [];
  const resolved = new Set<string>();

  while (remaining.size > 0) {
    let resolvedInPass = false;

    for (const [key, pokemon] of remaining) {
      const baseKey = pokemon.basePokemon ? pokemonKey(pokemon.basePokemon) : null;
      if (baseKey !== null && !resolved.has(baseKey)) {
        continue;
      }
      ordered.push(pokemon);
      resolved.add(key);
      remaining.delete(key);
      resolvedInPass = true;
    }

    if (!resolvedInPass) {
      throw new Error("元ポケモンの参照順を解決できません");
    }
  }

  return ordered;
}
