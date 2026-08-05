import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("PARTY-001 Prisma models", () => {
  const modelByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const partyModel = modelByName.get("Party");
  const partyPokemonModel = modelByName.get("PartyPokemon");
  const partyMoveModel = modelByName.get("PartyPokemonMove");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectories = readdirSync(migrationsDirectory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );
  const migrationDirectory = migrationDirectories.find((entry) =>
    entry.name.endsWith("_party_001_parties"),
  );

  if (!partyModel || !partyPokemonModel || !partyMoveModel) {
    throw new Error("Generated Prisma Client does not contain all PARTY-001 models");
  }
  if (!migrationDirectory) {
    throw new Error("PARTY-001 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );

  it("Party本体をUUID・所有者・ルール・名称・状態・timestampsで定義する", () => {
    expect(partyModel.dbName).toBe("parties");
    expect(partyModel.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "name",
        "description",
        "ruleId",
        "isActive",
        "createdAt",
        "updatedAt",
        "user",
        "rule",
        "pokemons",
      ]),
    );
    expect(partyModel.fields.find((field) => field.name === "id")).toMatchObject({
      type: "String",
      isId: true,
      isRequired: true,
    });
    expect(partyModel.fields.find((field) => field.name === "description")).toMatchObject({
      type: "String",
      isRequired: false,
    });
    expect(partyModel.fields.find((field) => field.name === "isActive")?.default).toBe(false);
    expect(partyModel.fields.find((field) => field.name === "updatedAt")?.isUpdatedAt).toBe(true);
    expect(migration).toContain('"id" UUID NOT NULL');
    expect(migration).toContain('"created_at" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"updated_at" TIMESTAMPTZ(3) NOT NULL');
  });

  it("PartyPokemonにマスタ参照と対策計算用構成値を保持する", () => {
    expect(partyPokemonModel.dbName).toBe("party_pokemons");
    expect(partyPokemonModel.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "id",
        "partyId",
        "slot",
        "pokemonId",
        "itemId",
        "abilityId",
        "nature",
        "teraType",
        "evs",
        "statPoints",
        "ivs",
        "actualStats",
        "moves",
      ]),
    );
    expect(partyPokemonModel.fields.find((field) => field.name === "evs")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(partyPokemonModel.fields.find((field) => field.name === "statPoints")).toMatchObject({
      type: "Json",
      isRequired: false,
      dbName: "stat_points",
    });
    expect(partyPokemonModel.fields.find((field) => field.name === "ivs")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(partyPokemonModel.fields.find((field) => field.name === "actualStats")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
    expect(partyPokemonModel.fields.some((field) => field.name === "canMega")).toBe(false);
  });

  it("PartyPokemonMoveを技slot付き中間モデルとして正規化する", () => {
    expect(partyMoveModel.dbName).toBe("party_pokemon_moves");
    expect(partyMoveModel.primaryKey?.fields).toEqual(["partyPokemonId", "moveId"]);
    expect(partyMoveModel.fields.find((field) => field.name === "slot")).toMatchObject({
      type: "Int",
      isRequired: true,
    });
  });

  it("所有者・親削除はCASCADE、ルールとマスタ削除はRESTRICTにする", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("party_pokemon_id") REFERENCES "party_pokemons"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT',
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
  });

  it("slot・Pokemon・Move重複とslot範囲をDB制約で防止する", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "party_pokemons_party_id_slot_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "party_pokemons_party_id_pokemon_id_key"');
    expect(migration).toContain(
      'CONSTRAINT "party_pokemon_moves_pkey" PRIMARY KEY ("party_pokemon_id","move_id")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "party_pokemon_moves_party_pokemon_id_slot_key"',
    );
    expect(migration).toContain('CONSTRAINT "party_pokemons_slot_range"');
    expect(migration).toContain('"slot" BETWEEN 1 AND 6');
    expect(migration).toContain('CONSTRAINT "party_pokemon_moves_slot_range"');
    expect(migration).toContain('"slot" BETWEEN 1 AND 4');
  });

  it("必須文字列とJSONBの型をDB制約で守る", () => {
    expect(migration).toContain('CONSTRAINT "parties_name_valid"');
    expect(migration).toContain('CONSTRAINT "parties_description_valid"');
    expect(migration).toContain('CONSTRAINT "party_pokemons_required_text_valid"');
    expect(migration).toContain('CONSTRAINT "party_pokemons_tera_type_valid"');
    expect(migration).toContain('CONSTRAINT "party_pokemons_evs_object"');
    expect(migration).toContain("jsonb_typeof(\"evs\") = 'object'");
    expect(migration).toContain('CONSTRAINT "party_pokemons_ivs_object"');
    expect(migration).toContain('CONSTRAINT "party_pokemons_actual_stats_object"');
  });

  it("逆引きインデックスを持ち、既存モデルとmigrationを維持する", () => {
    expect(migration).toContain('CREATE INDEX "parties_user_id_is_active_idx" ON "parties"');
    expect(migration).toContain('CREATE INDEX "party_pokemons_pokemon_id_idx" ON "party_pokemons"');
    expect(migration).toContain(
      'CREATE INDEX "party_pokemon_moves_move_id_idx" ON "party_pokemon_moves"',
    );
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
        "Archetype",
        "ArchetypePokemon",
        "ArchetypePokemonMove",
        "ArchetypeSource",
      ]),
    );
    expect(migrationDirectories.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "20260723221955_setup_005_init",
        "20260724090033_master_001_pokemons",
        "20260724103032_master_002_moves",
        "20260724105231_master_003_items_abilities",
        "20260724155557_master_004_pokemon_moves_seasons_rules",
        "20260724173014_auth_001_users",
        "20260724180801_auth_003_refresh_tokens",
        "20260724184408_archetype_001_archetype_schema",
      ]),
    );
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });
});
