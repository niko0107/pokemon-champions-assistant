import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("Move Prisma model", () => {
  const moveModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Move");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_master_002_moves"),
  );

  if (!moveModel) {
    throw new Error("Generated Prisma Client does not contain the Move model");
  }
  if (!migrationDirectory) {
    throw new Error("MASTER-002 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );

  it("設計書 §6.2 のカラムと型を持つ", () => {
    expect(moveModel.dbName).toBe("moves");
    expect(
      Object.fromEntries(
        moveModel.fields.map((field) => [
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
      type: { type: "String", required: true, unique: false },
      category: { type: "String", required: true, unique: false },
      power: { type: "Int", required: false, unique: false },
      accuracy: { type: "Int", required: false, unique: false },
      priority: { type: "Int", required: true, unique: false },
      tags: { type: "Json", required: true, unique: false },
    });
  });

  it("タグ用のGINインデックスを定義する", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    expect(schema).toContain("@@index([tags], type: Gin)");
    expect(migration).toContain('USING GIN ("tags")');
  });

  it("数値・分類・JSONBのDB制約をmigrationに含む", () => {
    expect(migration).toContain('CONSTRAINT "moves_required_text_not_blank"');
    expect(migration).toContain('CONSTRAINT "moves_category_allowed"');
    expect(migration).toContain("\"category\" IN ('physical', 'special', 'status')");
    expect(migration).toContain('CONSTRAINT "moves_power_range"');
    expect(migration).toContain('"power" IS NULL OR "power" BETWEEN 1 AND 300');
    expect(migration).toContain('CONSTRAINT "moves_accuracy_range"');
    expect(migration).toContain('"accuracy" IS NULL OR "accuracy" BETWEEN 1 AND 100');
    expect(migration).toContain('CONSTRAINT "moves_priority_range"');
    expect(migration).toContain('"priority" BETWEEN -7 AND 5');
    expect(migration).toContain('CONSTRAINT "moves_tags_array"');
    expect(migration).toContain("jsonb_typeof(\"tags\") = 'array'");
  });

  it("日本語名と英語名をそれぞれ一意にする", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "moves_name_ja_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "moves_name_en_key"');
  });

  it("既存のPokemonとSystemHealthCheckモデルを維持する", () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(expect.arrayContaining(["Pokemon", "SystemHealthCheck"]));
  });
});
