import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260731230000_party_003_champions_stat_points/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const initialPartyMigration = readFileSync(
  fileURLToPath(
    new URL("../prisma/migrations/20260724195827_party_001_parties/migration.sql", import.meta.url),
  ),
  "utf8",
);

describe("PARTY-003 Champions stat points schema", () => {
  const model = Prisma.dmmf.datamodel.models.find(({ name }) => name === "PartyPokemon");

  it("PartyPokemonへnullable JSONB statPointsを追加し、互換EV列をnullableにする", () => {
    expect(model?.fields.find(({ name }) => name === "statPoints")).toMatchObject({
      type: "Json",
      isRequired: false,
      dbName: "stat_points",
    });
    expect(model?.fields.find(({ name }) => name === "evs")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(migration).toContain('ADD COLUMN "stat_points" JSONB');
    expect(migration).toContain('ALTER COLUMN "evs" DROP NOT NULL');
    expect(migration).not.toContain('SET "stat_points"');
  });

  it("statPointsはnullまたはJSON objectだけを許可し、array・string・numberを拒否する", () => {
    expect(migration).toContain('CONSTRAINT "party_pokemons_stat_points_object"');
    expect(migration).toContain('"stat_points" IS NULL');
    expect(migration).toContain("jsonb_typeof(\"stat_points\") = 'object'");
    expect(migration).not.toContain("'array'");
    expect(migration).not.toContain("'string'");
    expect(migration).not.toContain("'number'");
  });

  it("既存値を変換せず、既存migrationと制約を変更しない", () => {
    expect(migration).not.toContain("UPDATE");
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("DROP CONSTRAINT");
    expect(initialPartyMigration).toContain('CONSTRAINT "party_pokemons_evs_object"');
    expect(initialPartyMigration).toContain('CONSTRAINT "party_pokemons_ivs_object"');
    expect(initialPartyMigration).toContain('CONSTRAINT "party_pokemons_actual_stats_object"');
  });
});
