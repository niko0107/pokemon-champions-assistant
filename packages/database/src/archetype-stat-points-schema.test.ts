import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260731100000_archetype_004c_champions_stat_points/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const statDataMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260729090000_archetype_004b_stat_data_status/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("ARCHETYPE-004C Champions stat points schema", () => {
  const model = Prisma.dmmf.datamodel.models.find(({ name }) => name === "ArchetypePokemon");

  it("ArchetypePokemonへnullable JSONB statPointsを追加する", () => {
    expect(model?.fields.find(({ name }) => name === "statPoints")).toMatchObject({
      type: "Json",
      isRequired: false,
      dbName: "stat_points",
    });
    expect(migration).toContain('ADD COLUMN "stat_points" JSONB');
    expect(migration).not.toContain('SET "stat_points"');
    expect(migration).not.toContain("NOT NULL");
  });

  it("nullまたはJSON objectだけを許可し、array・string・numberを拒否する", () => {
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_stat_points_object"');
    expect(migration).toContain('"stat_points" IS NULL');
    expect(migration).toContain("jsonb_typeof(\"stat_points\") = 'object'");
    expect(migration).not.toContain("'array'");
    expect(migration).not.toContain("'string'");
    expect(migration).not.toContain("'number'");
  });

  it("既存行をnullのまま維持し、exact・derived・partial制約を変更しない", () => {
    expect(migration).not.toContain("UPDATE");
    expect(migration).not.toContain("DROP CONSTRAINT");
    expect(migration).not.toContain("DROP COLUMN");
    expect(statDataMigration).toContain("'exact', 'derived', 'partial'");
    expect(statDataMigration).toContain('CONSTRAINT "archetype_pokemons_stat_data_consistent"');
  });
});
