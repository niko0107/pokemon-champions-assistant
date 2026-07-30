ALTER TABLE "archetype_pokemons"
    DROP CONSTRAINT "archetype_pokemons_role_valid",
    ADD CONSTRAINT "archetype_pokemons_role_valid" CHECK (
        "role" IN ('lead', 'sweeper', 'wall', 'pivot', 'support', 'unclassified')
    );
