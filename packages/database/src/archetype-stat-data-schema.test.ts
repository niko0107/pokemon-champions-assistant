import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260729090000_archetype_004b_stat_data_status/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("ARCHETYPE-004B stat data schema", () => {
  const model = Prisma.dmmf.datamodel.models.find(({ name }) => name === "ArchetypePokemon");

  it("IVと実数値データ状態を既存ArchetypePokemonへ追加する", () => {
    expect(model?.fields.find(({ name }) => name === "ivs")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(model?.fields.find(({ name }) => name === "statDataStatus")).toMatchObject({
      type: "String",
      isRequired: true,
      default: "exact",
    });
  });

  it("既存actualStatsをexact、nullをpartialへ移行する", () => {
    expect(migration).toContain("ADD COLUMN \"stat_data_status\" TEXT NOT NULL DEFAULT 'exact'");
    expect(migration).toContain("SET \"stat_data_status\" = 'partial'");
    expect(migration).toContain('WHERE "actual_stats" IS NULL');
  });

  it("IV object・状態値・actualStats整合をDBでも制約する", () => {
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_ivs_object"');
    expect(migration).toContain("jsonb_typeof(\"ivs\") = 'object'");
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_stat_data_status_valid"');
    expect(migration).toContain("'exact', 'derived', 'partial'");
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_stat_data_consistent"');
  });
});
