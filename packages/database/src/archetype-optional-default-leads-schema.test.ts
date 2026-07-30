import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ARCHETYPE-004A default_leads DB constraint", () => {
  const originalMigration = readFileSync(
    new URL(
      "../prisma/migrations/20260724184408_archetype_001_archetype_schema/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const optionalDefaultLeadsMigration = readFileSync(
    new URL(
      "../prisma/migrations/20260729060000_archetype_004a_optional_default_leads/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("既存migrationを変更せず、新規migrationでdefault_leadsを0〜6件へ緩和する", () => {
    expect(originalMigration).toContain('jsonb_array_length("default_leads") BETWEEN 1 AND 6');
    expect(optionalDefaultLeadsMigration).toContain(
      'DROP CONSTRAINT "archetypes_default_leads_array"',
    );
    expect(optionalDefaultLeadsMigration).toContain(
      'ADD CONSTRAINT "archetypes_default_leads_array"',
    );
    expect(optionalDefaultLeadsMigration).toContain(
      'jsonb_array_length("default_leads") BETWEEN 0 AND 6',
    );
    expect(optionalDefaultLeadsMigration).not.toContain(
      'jsonb_array_length("default_leads") BETWEEN 1 AND 6',
    );
  });
});
