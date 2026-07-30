ALTER TABLE "archetypes"
    DROP CONSTRAINT "archetypes_default_leads_array",
    ADD CONSTRAINT "archetypes_default_leads_array" CHECK (
        jsonb_typeof("default_leads") = 'array'
        AND jsonb_array_length("default_leads") BETWEEN 0 AND 6
    );
