-- AlterTable
ALTER TABLE "rules" ADD COLUMN "battle_level" INTEGER;

-- Existing development rules are explicitly migrated to the approved battle level.
UPDATE "rules" SET "battle_level" = 50;

ALTER TABLE "rules"
    ALTER COLUMN "battle_level" SET NOT NULL,
    ADD CONSTRAINT "rules_battle_level_range" CHECK ("battle_level" BETWEEN 1 AND 100);

-- AlterTable
ALTER TABLE "archetype_pokemons" ADD COLUMN "actual_stats" JSONB;

ALTER TABLE "archetype_pokemons"
    ADD CONSTRAINT "archetype_pokemons_actual_stats_object" CHECK (
        "actual_stats" IS NULL
        OR jsonb_typeof("actual_stats") = 'object'
    );

-- Rename the existing Party actual-stats JSON keys to the shared combat snapshot contract.
-- Rows not matching the complete legacy shape are left untouched for application-level rejection.
UPDATE "party_pokemons"
SET "actual_stats" = jsonb_build_object(
    'hp', "actual_stats" -> 'hp',
    'attack', "actual_stats" -> 'atk',
    'defense', "actual_stats" -> 'def',
    'specialAttack', "actual_stats" -> 'spa',
    'specialDefense', "actual_stats" -> 'spd',
    'speed', "actual_stats" -> 'spe'
)
WHERE "actual_stats" IS NOT NULL
  AND "actual_stats" ?& ARRAY['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
