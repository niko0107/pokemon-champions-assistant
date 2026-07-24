-- CreateTable
CREATE TABLE "archetypes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "season_id" INTEGER NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "popularity_tier" TEXT NOT NULL DEFAULT 'mid',
    "popularity_score" DECIMAL(7,4),
    "encounter_count" INTEGER NOT NULL DEFAULT 0,
    "pick_count" INTEGER NOT NULL DEFAULT 0,
    "default_leads" JSONB NOT NULL,
    "playstyle_notes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archetypes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archetypes_required_text_not_blank" CHECK (
        btrim("name") <> ''
        AND btrim("description") <> ''
        AND btrim("playstyle_notes") <> ''
    ),
    CONSTRAINT "archetypes_popularity_tier_valid" CHECK (
        "popularity_tier" IN ('high', 'mid', 'low')
    ),
    CONSTRAINT "archetypes_popularity_score_range" CHECK (
        "popularity_score" IS NULL
        OR "popularity_score" BETWEEN 0 AND 100
    ),
    CONSTRAINT "archetypes_counts_non_negative" CHECK (
        "encounter_count" >= 0
        AND "pick_count" >= 0
    ),
    CONSTRAINT "archetypes_default_leads_array" CHECK (
        jsonb_typeof("default_leads") = 'array'
        AND jsonb_array_length("default_leads") BETWEEN 1 AND 6
    ),
    CONSTRAINT "archetypes_status_valid" CHECK (
        "status" IN ('published', 'archived')
    )
);

-- CreateTable
CREATE TABLE "archetype_pokemons" (
    "id" UUID NOT NULL,
    "archetype_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "pokemon_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "item_alternatives" JSONB NOT NULL,
    "ability_id" INTEGER,
    "nature" TEXT,
    "tera_type" TEXT,
    "evs" JSONB,
    "role" TEXT NOT NULL,
    "usage_rate" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "threat_notes" TEXT,

    CONSTRAINT "archetype_pokemons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archetype_pokemons_slot_range" CHECK (
        "slot" BETWEEN 1 AND 6
    ),
    CONSTRAINT "archetype_pokemons_item_alternatives_array" CHECK (
        jsonb_typeof("item_alternatives") = 'array'
    ),
    CONSTRAINT "archetype_pokemons_evs_object" CHECK (
        "evs" IS NULL
        OR jsonb_typeof("evs") = 'object'
    ),
    CONSTRAINT "archetype_pokemons_optional_text_not_blank" CHECK (
        ("nature" IS NULL OR btrim("nature") <> '')
        AND ("tera_type" IS NULL OR btrim("tera_type") <> '')
        AND ("threat_notes" IS NULL OR btrim("threat_notes") <> '')
    ),
    CONSTRAINT "archetype_pokemons_role_valid" CHECK (
        "role" IN ('lead', 'sweeper', 'wall', 'pivot', 'support')
    ),
    CONSTRAINT "archetype_pokemons_usage_rate_range" CHECK (
        "usage_rate" BETWEEN 0 AND 1
    )
);

-- CreateTable
CREATE TABLE "archetype_pokemon_moves" (
    "archetype_pokemon_id" UUID NOT NULL,
    "move_id" INTEGER NOT NULL,
    "adoption_rate" DECIMAL(5,4) NOT NULL DEFAULT 1.0,

    CONSTRAINT "archetype_pokemon_moves_pkey" PRIMARY KEY ("archetype_pokemon_id","move_id"),
    CONSTRAINT "archetype_pokemon_moves_adoption_rate_range" CHECK (
        "adoption_rate" BETWEEN 0 AND 1
    )
);

-- CreateTable
CREATE TABLE "archetype_sources" (
    "id" UUID NOT NULL,
    "archetype_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "site_name" TEXT NOT NULL,
    "site_rank" INTEGER,

    CONSTRAINT "archetype_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archetype_sources_required_text_not_blank" CHECK (
        btrim("title") <> ''
        AND btrim("url") <> ''
        AND btrim("site_name") <> ''
    ),
    CONSTRAINT "archetype_sources_site_rank_positive" CHECK (
        "site_rank" IS NULL
        OR "site_rank" > 0
    )
);

-- CreateIndex
CREATE INDEX "archetypes_season_id_rule_id_status_idx" ON "archetypes"("season_id", "rule_id", "status");

-- CreateIndex
CREATE INDEX "archetypes_popularity_tier_encounter_count_updated_at_idx" ON "archetypes"("popularity_tier", "encounter_count", "updated_at");

-- CreateIndex
CREATE INDEX "archetype_pokemons_pokemon_id_idx" ON "archetype_pokemons"("pokemon_id");

-- CreateIndex
CREATE INDEX "archetype_pokemons_item_id_idx" ON "archetype_pokemons"("item_id");

-- CreateIndex
CREATE INDEX "archetype_pokemons_ability_id_idx" ON "archetype_pokemons"("ability_id");

-- CreateIndex
CREATE UNIQUE INDEX "archetype_pokemons_archetype_id_slot_key" ON "archetype_pokemons"("archetype_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "archetype_pokemons_archetype_id_pokemon_id_key" ON "archetype_pokemons"("archetype_id", "pokemon_id");

-- CreateIndex
CREATE INDEX "archetype_pokemon_moves_move_id_idx" ON "archetype_pokemon_moves"("move_id");

-- CreateIndex
CREATE UNIQUE INDEX "archetype_sources_archetype_id_url_key" ON "archetype_sources"("archetype_id", "url");

-- AddForeignKey
ALTER TABLE "archetypes" ADD CONSTRAINT "archetypes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetypes" ADD CONSTRAINT "archetypes_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemons" ADD CONSTRAINT "archetype_pokemons_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemons" ADD CONSTRAINT "archetype_pokemons_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemons" ADD CONSTRAINT "archetype_pokemons_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemons" ADD CONSTRAINT "archetype_pokemons_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemon_moves" ADD CONSTRAINT "archetype_pokemon_moves_archetype_pokemon_id_fkey" FOREIGN KEY ("archetype_pokemon_id") REFERENCES "archetype_pokemons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_pokemon_moves" ADD CONSTRAINT "archetype_pokemon_moves_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetype_sources" ADD CONSTRAINT "archetype_sources_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
