import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("BATTLE-001 Prisma models", () => {
  const modelByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const sessionModel = modelByName.get("BattleSession");
  const observationModel = modelByName.get("Observation");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectories = readdirSync(migrationsDirectory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );
  const sessionMigrationDirectory = migrationDirectories.find((entry) =>
    entry.name.endsWith("_battle_001_sessions"),
  );
  const constraintMigrationDirectory = migrationDirectories.find((entry) =>
    entry.name.endsWith("_battle_001_constraints"),
  );

  if (!sessionModel || !observationModel) {
    throw new Error("Generated Prisma Client does not contain all BATTLE-001 models");
  }
  if (!sessionMigrationDirectory || !constraintMigrationDirectory) {
    throw new Error("BATTLE-001 migrations do not exist");
  }

  const migration = [
    readFileSync(
      new URL(`${sessionMigrationDirectory.name}/migration.sql`, migrationsDirectory),
      "utf8",
    ),
    readFileSync(
      new URL(`${constraintMigrationDirectory.name}/migration.sql`, migrationsDirectory),
      "utf8",
    ),
  ].join("\n");

  it("BattleSessionをUUID・所有者・Party・Rule・状態・timestampsで定義する", () => {
    expect(sessionModel.dbName).toBe("battle_sessions");
    expect(sessionModel.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "partyId",
        "ruleId",
        "status",
        "selectedArchetypeId",
        "result",
        "startedAt",
        "endedAt",
        "createdAt",
        "updatedAt",
        "observations",
      ]),
    );
    expect(sessionModel.fields.find((field) => field.name === "id")).toMatchObject({
      type: "String",
      isId: true,
      isRequired: true,
    });
    expect(sessionModel.fields.find((field) => field.name === "status")?.default).toBe("active");
    expect(sessionModel.fields.find((field) => field.name === "endedAt")).toMatchObject({
      type: "DateTime",
      isRequired: false,
    });
    expect(sessionModel.fields.find((field) => field.name === "updatedAt")?.isUpdatedAt).toBe(true);
    expect(migration).toContain('"id" UUID NOT NULL');
    expect(migration).toContain('"started_at" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"ended_at" TIMESTAMPTZ(3)');
    expect(migration).toContain('"created_at" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"updated_at" TIMESTAMPTZ(3) NOT NULL');
  });

  it("Observationを後続タスク向けの最小追記型モデルとして定義する", () => {
    expect(observationModel.dbName).toBe("observations");
    expect(observationModel.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "id",
        "sessionId",
        "seq",
        "kind",
        "pokemonId",
        "moveId",
        "itemId",
        "abilityId",
        "position",
        "isRevoked",
        "observedAt",
      ]),
    );
    expect(observationModel.fields.find((field) => field.name === "pokemonId")?.isRequired).toBe(
      false,
    );
    expect(observationModel.fields.find((field) => field.name === "isRevoked")?.default).toBe(
      false,
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "observations_session_id_seq_key" ON "observations"',
    );
  });

  it("User・Party削除はCASCADE、Rule削除はRESTRICTにする", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("session_id") REFERENCES "battle_sessions"("id") ON DELETE CASCADE',
    );
  });

  it("status・result・観測種別をDB CHECKで制約する", () => {
    expect(migration).toContain('CONSTRAINT "battle_sessions_status_valid"');
    expect(migration).toContain("\"status\" IN ('active', 'ended', 'archived')");
    expect(migration).toContain('CONSTRAINT "battle_sessions_result_valid"');
    expect(migration).toContain("\"result\" IN ('win', 'lose', 'unknown')");
    expect(migration).toContain('CONSTRAINT "observations_kind_valid"');
    expect(migration).toContain(
      "\"kind\" IN ('pokemon', 'move', 'item', 'ability', 'position', 'mega')",
    );
    expect(migration).toContain('CONSTRAINT "observations_payload_valid"');
  });

  it("所有者状態・Party・Rule・アーカイブ対象検索に必要なindexを持つ", () => {
    expect(migration).toContain('CREATE INDEX "battle_sessions_user_id_status_idx"');
    expect(migration).toContain('CREATE INDEX "battle_sessions_party_id_idx"');
    expect(migration).toContain('CREATE INDEX "battle_sessions_rule_id_idx"');
    expect(migration).toContain('CREATE INDEX "battle_sessions_status_started_at_idx"');
  });

  it("既存モデルとmigrationを維持し、破壊的SQLを含まない", () => {
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
        "Party",
        "PartyPokemon",
        "PartyPokemonMove",
        "Archetype",
        "ArchetypePokemon",
        "ArchetypePokemonMove",
        "ArchetypeSource",
      ]),
    );
    expect(migrationDirectories.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["20260723221955_setup_005_init", "20260724195827_party_001_parties"]),
    );
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });
});
