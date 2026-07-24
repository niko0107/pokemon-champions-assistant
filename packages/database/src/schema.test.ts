import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("Pokemon Prisma model", () => {
  const pokemonModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Pokemon");
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260724090033_master_001_pokemons/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  if (!pokemonModel) {
    throw new Error("Generated Prisma Client does not contain the Pokemon model");
  }

  it("設計書 §6.2 のカラムと型を持つ", () => {
    expect(pokemonModel.dbName).toBe("pokemons");
    expect(
      Object.fromEntries(
        pokemonModel.fields.map((field) => [
          field.name,
          { type: field.type, required: field.isRequired, list: field.isList },
        ]),
      ),
    ).toMatchObject({
      id: { type: "Int", required: true, list: false },
      dexNo: { type: "Int", required: true, list: false },
      nameJa: { type: "String", required: true, list: false },
      nameEn: { type: "String", required: true, list: false },
      form: { type: "String", required: true, list: false },
      type1: { type: "String", required: true, list: false },
      type2: { type: "String", required: false, list: false },
      baseHp: { type: "Int", required: true, list: false },
      baseAtk: { type: "Int", required: true, list: false },
      baseDef: { type: "Int", required: true, list: false },
      baseSpa: { type: "Int", required: true, list: false },
      baseSpd: { type: "Int", required: true, list: false },
      baseSpe: { type: "Int", required: true, list: false },
      abilities: { type: "Json", required: true, list: false },
      isMega: { type: "Boolean", required: true, list: false },
      basePokemonId: { type: "Int", required: false, list: false },
    });
  });

  it("形態の一意制約と元ポケモンへの自己参照を持つ", () => {
    expect(pokemonModel.uniqueFields).toContainEqual(["dexNo", "form"]);
    expect(pokemonModel.fields.find((field) => field.name === "basePokemon")).toMatchObject({
      type: "Pokemon",
      relationName: "PokemonForms",
      relationFromFields: ["basePokemonId"],
      relationToFields: ["id"],
    });
    expect(pokemonModel.fields.find((field) => field.name === "derivedForms")).toMatchObject({
      type: "Pokemon",
      relationName: "PokemonForms",
      isList: true,
    });
  });

  it("名前検索と自己参照外部キー用のインデックスを定義する", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    expect(schema).toContain("@@index([nameJa])");
    expect(schema).toContain("@@index([nameEn])");
    expect(schema).toContain("@@index([basePokemonId])");
  });

  it("不正なマスタ行を防ぐDB制約をmigrationに含む", () => {
    expect(migration).toContain('CONSTRAINT "pokemons_dex_no_positive"');
    expect(migration).toContain('CONSTRAINT "pokemons_required_text_not_blank"');
    expect(migration).toContain('CONSTRAINT "pokemons_distinct_types"');
    expect(migration).toContain('CONSTRAINT "pokemons_base_stats_range"');
    expect(migration).toContain('CONSTRAINT "pokemons_abilities_nonempty_array"');
    expect(migration).toContain('CONSTRAINT "pokemons_mega_base_required"');
    expect(migration).toContain('CONSTRAINT "pokemons_not_own_base"');
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });

  it("既存のSystemHealthCheckモデルを維持する", () => {
    expect(Prisma.dmmf.datamodel.models.some((model) => model.name === "SystemHealthCheck")).toBe(
      true,
    );
  });
});
