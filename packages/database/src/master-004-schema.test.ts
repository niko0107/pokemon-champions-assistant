import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("MASTER-004 Prisma models", () => {
  const pokemonMoveModel = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "PokemonMove",
  );
  const seasonModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Season");
  const ruleModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "Rule");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) =>
      entry.isDirectory() && entry.name.endsWith("_master_004_pokemon_moves_seasons_rules"),
  );

  if (!pokemonMoveModel) {
    throw new Error("Generated Prisma Client does not contain the PokemonMove model");
  }
  if (!seasonModel) {
    throw new Error("Generated Prisma Client does not contain the Season model");
  }
  if (!ruleModel) {
    throw new Error("Generated Prisma Client does not contain the Rule model");
  }
  if (!migrationDirectory) {
    throw new Error("MASTER-004 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );

  it("PokemonMoveをフォルム単位の複合主キーで定義する", () => {
    expect(pokemonMoveModel.dbName).toBe("pokemon_moves");
    expect(pokemonMoveModel.fields.map((field) => field.name)).toEqual([
      "pokemonId",
      "moveId",
      "pokemon",
      "move",
    ]);
    expect(pokemonMoveModel.primaryKey?.fields).toEqual(["pokemonId", "moveId"]);
    expect(migration).toContain(
      'CONSTRAINT "pokemon_moves_pkey" PRIMARY KEY ("pokemon_id","move_id")',
    );
    expect(
      Object.fromEntries(
        pokemonMoveModel.fields.map((field) => [
          field.name,
          {
            type: field.type,
            required: field.isRequired,
            relationFromFields: field.relationFromFields,
            relationToFields: field.relationToFields,
            relationOnDelete: field.relationOnDelete,
          },
        ]),
      ),
    ).toMatchObject({
      pokemonId: { type: "Int", required: true },
      moveId: { type: "Int", required: true },
      pokemon: {
        type: "Pokemon",
        required: true,
        relationFromFields: ["pokemonId"],
        relationToFields: ["id"],
        relationOnDelete: "Cascade",
      },
      move: {
        type: "Move",
        required: true,
        relationFromFields: ["moveId"],
        relationToFields: ["id"],
        relationOnDelete: "Cascade",
      },
    });
  });

  it("PokemonMoveの外部キーと逆引きインデックスをmigrationに含む", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'CREATE INDEX "pokemon_moves_move_id_idx" ON "pokemon_moves"("move_id")',
    );
  });

  it("Seasonを名称とDATE期間で定義する", () => {
    expect(seasonModel.dbName).toBe("seasons");
    expect(
      Object.fromEntries(
        seasonModel.fields.map((field) => [
          field.name,
          { type: field.type, required: field.isRequired, unique: field.isUnique },
        ]),
      ),
    ).toMatchObject({
      id: { type: "Int", required: true, unique: false },
      name: { type: "String", required: true, unique: true },
      startsAt: { type: "DateTime", required: true, unique: false },
      endsAt: { type: "DateTime", required: true, unique: false },
    });
    expect(migration).toContain('"starts_at" DATE NOT NULL');
    expect(migration).toContain('"ends_at" DATE NOT NULL');
  });

  it("Ruleを名称とチーム・選出人数で定義する", () => {
    expect(ruleModel.dbName).toBe("rules");
    expect(
      Object.fromEntries(
        ruleModel.fields.map((field) => [
          field.name,
          { type: field.type, required: field.isRequired, unique: field.isUnique },
        ]),
      ),
    ).toMatchObject({
      id: { type: "Int", required: true, unique: false },
      name: { type: "String", required: true, unique: true },
      teamSize: { type: "Int", required: true, unique: false },
      pickSize: { type: "Int", required: true, unique: false },
    });
  });

  it("SeasonとRuleの名称・期間・人数制約をmigrationに含む", () => {
    expect(migration).toContain('CONSTRAINT "seasons_required_text_not_blank"');
    expect(migration).toContain('CONSTRAINT "seasons_date_order"');
    expect(migration).toContain('"ends_at" >= "starts_at"');
    expect(migration).toContain('CONSTRAINT "rules_required_text_not_blank"');
    expect(migration).toContain('CONSTRAINT "rules_team_size_range"');
    expect(migration).toContain('"team_size" BETWEEN 1 AND 6');
    expect(migration).toContain('CONSTRAINT "rules_pick_size_range"');
    expect(migration).toContain('"pick_size" BETWEEN 1 AND 6');
    expect(migration).toContain('CONSTRAINT "rules_pick_not_greater_than_team"');
    expect(migration).toContain('"pick_size" <= "team_size"');
  });

  it("名称の一意制約とSeason期間インデックスをmigrationに含む", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "seasons_name_key"');
    expect(migration).toContain('CREATE INDEX "seasons_starts_at_ends_at_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "rules_name_key"');
  });

  it("既存のマスタ・ヘルスチェックモデルを維持する", () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(
      expect.arrayContaining(["Pokemon", "Move", "Item", "Ability", "SystemHealthCheck"]),
    );
  });
});
