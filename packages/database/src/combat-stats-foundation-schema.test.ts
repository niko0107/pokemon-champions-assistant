import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const migration = readFileSync(
  new URL("20260727090000_matchup_008a_combat_stats_foundation/migration.sql", migrationsDirectory),
  "utf8",
);
const originalRuleMigration = readFileSync(
  new URL(
    "20260724155557_master_004_pokemon_moves_seasons_rules/migration.sql",
    migrationsDirectory,
  ),
  "utf8",
);
const originalArchetypeMigration = readFileSync(
  new URL("20260724184408_archetype_001_archetype_schema/migration.sql", migrationsDirectory),
  "utf8",
);

describe("MATCHUP-008A combat stats foundation", () => {
  const ruleModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Rule");
  const archetypePokemonModel = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "ArchetypePokemon",
  );

  if (!ruleModel || !archetypePokemonModel) {
    throw new Error("Generated Prisma Client does not contain MATCHUP-008A models");
  }

  it("Rule.battleLevelを必須Intとして定義する", () => {
    expect(ruleModel.fields.find((field) => field.name === "battleLevel")).toMatchObject({
      type: "Int",
      isRequired: true,
    });
    expect(migration).toContain('ADD COLUMN "battle_level" INTEGER');
    expect(migration).toContain('UPDATE "rules" SET "battle_level" = 50');
    expect(migration).toContain('ALTER COLUMN "battle_level" SET NOT NULL');
    expect(migration).toContain('CONSTRAINT "rules_battle_level_range"');
    expect(migration).toContain('"battle_level" BETWEEN 1 AND 100');
  });

  it("ArchetypePokemon.actualStatsをnullable JSONBとして定義する", () => {
    expect(
      archetypePokemonModel.fields.find((field) => field.name === "actualStats"),
    ).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(migration).toContain('ALTER TABLE "archetype_pokemons" ADD COLUMN "actual_stats" JSONB');
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_actual_stats_object"');
    expect(migration).toContain('"actual_stats" IS NULL');
    expect(migration).toContain("jsonb_typeof(\"actual_stats\") = 'object'");
  });

  it("既存Party actualStatsを共通の意味名へ等価変換する", () => {
    expect(migration).toContain("'attack', \"actual_stats\" -> 'atk'");
    expect(migration).toContain("'defense', \"actual_stats\" -> 'def'");
    expect(migration).toContain("'specialAttack', \"actual_stats\" -> 'spa'");
    expect(migration).toContain("'specialDefense', \"actual_stats\" -> 'spd'");
    expect(migration).toContain("'speed', \"actual_stats\" -> 'spe'");
  });

  it("既存migrationを改変せず新規forward migrationだけで追加する", () => {
    expect(originalRuleMigration).not.toContain("battle_level");
    expect(originalArchetypeMigration).not.toContain("actual_stats");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("DROP CONSTRAINT");
  });
});
