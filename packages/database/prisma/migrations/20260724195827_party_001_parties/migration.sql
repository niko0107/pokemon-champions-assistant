-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "rule_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parties_name_valid" CHECK (
        char_length("name") BETWEEN 1 AND 100
        AND "name" = btrim("name")
    ),
    CONSTRAINT "parties_description_valid" CHECK (
        "description" IS NULL
        OR (
            btrim("description") <> ''
            AND "description" = btrim("description")
        )
    )
);

-- CreateTable
CREATE TABLE "party_pokemons" (
    "id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "pokemon_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "ability_id" INTEGER,
    "nature" TEXT NOT NULL,
    "tera_type" TEXT,
    "evs" JSONB NOT NULL,
    "ivs" JSONB,
    "actual_stats" JSONB,

    CONSTRAINT "party_pokemons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "party_pokemons_slot_range" CHECK (
        "slot" BETWEEN 1 AND 6
    ),
    CONSTRAINT "party_pokemons_required_text_valid" CHECK (
        btrim("nature") <> ''
        AND "nature" = btrim("nature")
    ),
    CONSTRAINT "party_pokemons_tera_type_valid" CHECK (
        "tera_type" IS NULL
        OR (
            btrim("tera_type") <> ''
            AND "tera_type" = btrim("tera_type")
        )
    ),
    CONSTRAINT "party_pokemons_evs_object" CHECK (
        jsonb_typeof("evs") = 'object'
    ),
    CONSTRAINT "party_pokemons_ivs_object" CHECK (
        "ivs" IS NULL
        OR jsonb_typeof("ivs") = 'object'
    ),
    CONSTRAINT "party_pokemons_actual_stats_object" CHECK (
        "actual_stats" IS NULL
        OR jsonb_typeof("actual_stats") = 'object'
    )
);

-- CreateTable
CREATE TABLE "party_pokemon_moves" (
    "party_pokemon_id" UUID NOT NULL,
    "move_id" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,

    CONSTRAINT "party_pokemon_moves_pkey" PRIMARY KEY ("party_pokemon_id","move_id"),
    CONSTRAINT "party_pokemon_moves_slot_range" CHECK (
        "slot" BETWEEN 1 AND 4
    )
);

-- CreateIndex
CREATE INDEX "parties_user_id_is_active_idx" ON "parties"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "parties_rule_id_idx" ON "parties"("rule_id");

-- CreateIndex
CREATE INDEX "party_pokemons_pokemon_id_idx" ON "party_pokemons"("pokemon_id");

-- CreateIndex
CREATE INDEX "party_pokemons_item_id_idx" ON "party_pokemons"("item_id");

-- CreateIndex
CREATE INDEX "party_pokemons_ability_id_idx" ON "party_pokemons"("ability_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_pokemons_party_id_slot_key" ON "party_pokemons"("party_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "party_pokemons_party_id_pokemon_id_key" ON "party_pokemons"("party_id", "pokemon_id");

-- CreateIndex
CREATE INDEX "party_pokemon_moves_move_id_idx" ON "party_pokemon_moves"("move_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_pokemon_moves_party_pokemon_id_slot_key" ON "party_pokemon_moves"("party_pokemon_id", "slot");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemons" ADD CONSTRAINT "party_pokemons_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemons" ADD CONSTRAINT "party_pokemons_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemons" ADD CONSTRAINT "party_pokemons_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemons" ADD CONSTRAINT "party_pokemons_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemon_moves" ADD CONSTRAINT "party_pokemon_moves_party_pokemon_id_fkey" FOREIGN KEY ("party_pokemon_id") REFERENCES "party_pokemons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_pokemon_moves" ADD CONSTRAINT "party_pokemon_moves_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
