ALTER TABLE "archetype_pokemons"
    ADD COLUMN "ivs" JSONB,
    ADD COLUMN "stat_data_status" TEXT NOT NULL DEFAULT 'exact';

UPDATE "archetype_pokemons"
SET "stat_data_status" = 'partial'
WHERE "actual_stats" IS NULL;

ALTER TABLE "archetype_pokemons"
    ADD CONSTRAINT "archetype_pokemons_ivs_object" CHECK (
        "ivs" IS NULL
        OR jsonb_typeof("ivs") = 'object'
    ),
    ADD CONSTRAINT "archetype_pokemons_stat_data_status_valid" CHECK (
        "stat_data_status" IN ('exact', 'derived', 'partial')
    ),
    ADD CONSTRAINT "archetype_pokemons_stat_data_consistent" CHECK (
        (
            "stat_data_status" = 'partial'
            AND "actual_stats" IS NULL
        )
        OR (
            "stat_data_status" = 'exact'
            AND "actual_stats" IS NOT NULL
        )
        OR (
            "stat_data_status" = 'derived'
            AND "actual_stats" IS NOT NULL
            AND "ivs" IS NOT NULL
            AND "evs" IS NOT NULL
            AND "nature" IS NOT NULL
        )
    );
