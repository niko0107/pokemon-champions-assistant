import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const originalMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260724184408_archetype_001_archetype_schema/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260731130000_archetype_004d_unclassified_role/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("ARCHETYPE-004D unclassified role schema", () => {
  const model = Prisma.dmmf.datamodel.models.find(({ name }) => name === "ArchetypePokemon");
  const roleField = model?.fields.find(({ name }) => name === "role");

  it("role列を必須・defaultなしのまま維持する", () => {
    expect(roleField).toMatchObject({
      type: "String",
      isRequired: true,
      hasDefaultValue: false,
    });
  });

  it("既存migrationを変更せず、新規migrationでunclassifiedだけを許可値へ追加する", () => {
    expect(originalMigration).toContain(
      "\"role\" IN ('lead', 'sweeper', 'wall', 'pivot', 'support')",
    );
    expect(originalMigration).not.toContain("unclassified");
    expect(migration).toContain('DROP CONSTRAINT "archetype_pokemons_role_valid"');
    expect(migration).toContain('ADD CONSTRAINT "archetype_pokemons_role_valid"');
    expect(migration).toContain(
      "\"role\" IN ('lead', 'sweeper', 'wall', 'pivot', 'support', 'unclassified')",
    );
  });

  it("既存roleを変更せず、null・default・データ移行を追加しない", () => {
    for (const role of ["lead", "sweeper", "wall", "pivot", "support"]) {
      expect(migration).toContain(`'${role}'`);
    }
    expect(migration).not.toContain("UPDATE");
    expect(migration).not.toContain("DEFAULT");
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("ALTER COLUMN");
  });
});
