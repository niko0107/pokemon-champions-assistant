import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("Item and Ability Prisma models", () => {
  const itemModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Item");
  const abilityModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Ability");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_master_003_items_abilities"),
  );

  if (!itemModel) {
    throw new Error("Generated Prisma Client does not contain the Item model");
  }
  if (!abilityModel) {
    throw new Error("Generated Prisma Client does not contain the Ability model");
  }
  if (!migrationDirectory) {
    throw new Error("MASTER-003 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );

  it.each([
    { model: itemModel, modelName: "Item", tableName: "items" },
    { model: abilityModel, modelName: "Ability", tableName: "abilities" },
  ])("$modelNameは設計書 §6.2 のカラムと型を持つ", ({ model, tableName }) => {
    expect(model.dbName).toBe(tableName);
    expect(
      Object.fromEntries(
        model.fields.map((field) => [
          field.name,
          {
            type: field.type,
            required: field.isRequired,
            unique: field.isUnique,
          },
        ]),
      ),
    ).toMatchObject({
      id: { type: "Int", required: true, unique: false },
      nameJa: { type: "String", required: true, unique: true },
      nameEn: { type: "String", required: true, unique: true },
      effectTags: { type: "Json", required: true, unique: false },
    });
  });

  it.each(["items", "abilities"])("%sに名称・JSONBのDB制約を含む", (tableName) => {
    expect(migration).toContain(`CONSTRAINT "${tableName}_required_text_not_blank"`);
    expect(migration).toContain(`CONSTRAINT "${tableName}_effect_tags_array"`);
    expect(migration).toContain(`jsonb_typeof("effect_tags") = 'array'`);
  });

  it.each(["items", "abilities"])("%sの名称を言語ごとに一意にする", (tableName) => {
    expect(migration).toContain(`CREATE UNIQUE INDEX "${tableName}_name_ja_key"`);
    expect(migration).toContain(`CREATE UNIQUE INDEX "${tableName}_name_en_key"`);
  });

  it.each(["items", "abilities"])("%sのタグにGINインデックスを持つ", (tableName) => {
    expect(migration).toContain(
      `CREATE INDEX "${tableName}_effect_tags_idx" ON "${tableName}" USING GIN ("effect_tags")`,
    );
  });

  it("既存のPokemon、Move、SystemHealthCheckモデルを維持する", () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(expect.arrayContaining(["Pokemon", "Move", "SystemHealthCheck"]));
  });
});
