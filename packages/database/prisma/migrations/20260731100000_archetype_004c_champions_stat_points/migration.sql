ALTER TABLE "archetype_pokemons"
    ADD COLUMN "stat_points" JSONB;

ALTER TABLE "archetype_pokemons"
    ADD CONSTRAINT "archetype_pokemons_stat_points_object" CHECK (
        "stat_points" IS NULL
        OR jsonb_typeof("stat_points") = 'object'
    );
