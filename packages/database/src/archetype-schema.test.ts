import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("ARCHETYPE-001 Prisma models", () => {
  const modelByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const archetypeModel = modelByName.get("Archetype");
  const archetypePokemonModel = modelByName.get("ArchetypePokemon");
  const archetypeMoveModel = modelByName.get("ArchetypePokemonMove");
  const archetypeSourceModel = modelByName.get("ArchetypeSource");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_archetype_001_archetype_schema"),
  );

  if (!archetypeModel || !archetypePokemonModel || !archetypeMoveModel || !archetypeSourceModel) {
    throw new Error("Generated Prisma Client does not contain all ARCHETYPE-001 models");
  }
  if (!migrationDirectory) {
    throw new Error("ARCHETYPE-001 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );

  it("Archetype本体にシーズン・ルール・人気度・選出・公開時刻を保持する", () => {
    expect(archetypeModel.dbName).toBe("archetypes");
    expect(archetypeModel.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "description",
        "seasonId",
        "ruleId",
        "popularityTier",
        "popularityScore",
        "encounterCount",
        "pickCount",
        "defaultLeads",
        "playstyleNotes",
        "status",
        "publishedAt",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(archetypeModel.fields.find((field) => field.name === "id")).toMatchObject({
      type: "String",
      isId: true,
      isRequired: true,
    });
    expect(archetypeModel.fields.find((field) => field.name === "defaultLeads")).toMatchObject({
      type: "Json",
      isRequired: true,
    });
    expect(archetypeModel.fields.find((field) => field.name === "updatedAt")?.isUpdatedAt).toBe(
      true,
    );
  });

  it("採用ポケモン・技・出典を正規化したモデルとして定義する", () => {
    expect(archetypePokemonModel.dbName).toBe("archetype_pokemons");
    expect(archetypeMoveModel.dbName).toBe("archetype_pokemon_moves");
    expect(archetypeSourceModel.dbName).toBe("archetype_sources");
    expect(archetypeMoveModel.primaryKey?.fields).toEqual(["archetypePokemonId", "moveId"]);
    expect(archetypePokemonModel.fields.find((field) => field.name === "pokemon")).toMatchObject({
      relationFromFields: ["pokemonId"],
      relationToFields: ["id"],
      relationOnDelete: "Restrict",
    });
    expect(archetypeMoveModel.fields.find((field) => field.name === "move")).toMatchObject({
      relationFromFields: ["moveId"],
      relationToFields: ["id"],
      relationOnDelete: "Restrict",
    });
  });

  it("構築削除は子要素へCASCADEし、マスタ削除はRESTRICTする", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT',
    );
  });

  it("仕様上の逆引き・対象化インデックスと構築内重複防止制約を持つ", () => {
    expect(migration).toContain(
      'CREATE INDEX "archetypes_season_id_rule_id_status_idx" ON "archetypes"',
    );
    expect(migration).toContain(
      'CREATE INDEX "archetype_pokemons_pokemon_id_idx" ON "archetype_pokemons"',
    );
    expect(migration).toContain(
      'CREATE INDEX "archetype_pokemon_moves_move_id_idx" ON "archetype_pokemon_moves"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "archetype_pokemons_archetype_id_slot_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "archetype_pokemons_archetype_id_pokemon_id_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "archetype_sources_archetype_id_url_key"',
    );
  });

  it("列挙値・数値範囲・JSONB形状・必須文字列をDB制約で守る", () => {
    expect(migration).toContain('CONSTRAINT "archetypes_popularity_tier_valid"');
    expect(migration).toContain("\"popularity_tier\" IN ('high', 'mid', 'low')");
    expect(migration).toContain('CONSTRAINT "archetypes_status_valid"');
    expect(migration).toContain("\"status\" IN ('published', 'archived')");
    expect(migration).toContain('CONSTRAINT "archetypes_counts_non_negative"');
    expect(migration).toContain('CONSTRAINT "archetypes_default_leads_array"');
    expect(migration).toContain('jsonb_typeof("default_leads") = \'array\'');
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_slot_range"');
    expect(migration).toContain('"slot" BETWEEN 1 AND 6');
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_role_valid"');
    expect(migration).toContain('CONSTRAINT "archetype_pokemons_usage_rate_range"');
    expect(migration).toContain('CONSTRAINT "archetype_pokemon_moves_adoption_rate_range"');
    expect(migration).toContain('CONSTRAINT "archetype_sources_required_text_not_blank"');
  });

  it("既存モデルを維持し、encounter_reportsは追加しない", () => {
    expect([...modelByName.keys()]).toEqual(
      expect.arrayContaining([
        "SystemHealthCheck",
        "User",
        "RefreshToken",
        "Pokemon",
        "Move",
        "Item",
        "Ability",
        "PokemonMove",
        "Season",
        "Rule",
      ]),
    );
    expect(modelByName.has("EncounterReport")).toBe(false);
  });
});
