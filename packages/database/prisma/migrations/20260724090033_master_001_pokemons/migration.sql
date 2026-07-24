-- CreateTable
CREATE TABLE "pokemons" (
    "id" SERIAL NOT NULL,
    "dex_no" INTEGER NOT NULL,
    "name_ja" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "type1" TEXT NOT NULL,
    "type2" TEXT,
    "base_hp" INTEGER NOT NULL,
    "base_atk" INTEGER NOT NULL,
    "base_def" INTEGER NOT NULL,
    "base_spa" INTEGER NOT NULL,
    "base_spd" INTEGER NOT NULL,
    "base_spe" INTEGER NOT NULL,
    "abilities" JSONB NOT NULL,
    "is_mega" BOOLEAN NOT NULL DEFAULT false,
    "base_pokemon_id" INTEGER,

    CONSTRAINT "pokemons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pokemons_dex_no_positive" CHECK ("dex_no" > 0),
    CONSTRAINT "pokemons_required_text_not_blank" CHECK (
        btrim("name_ja") <> '' AND
        btrim("name_en") <> '' AND
        btrim("form") <> '' AND
        btrim("type1") <> ''
    ),
    CONSTRAINT "pokemons_type2_not_blank" CHECK ("type2" IS NULL OR btrim("type2") <> ''),
    CONSTRAINT "pokemons_distinct_types" CHECK ("type2" IS NULL OR "type2" <> "type1"),
    CONSTRAINT "pokemons_base_stats_range" CHECK (
        "base_hp" BETWEEN 1 AND 255 AND
        "base_atk" BETWEEN 1 AND 255 AND
        "base_def" BETWEEN 1 AND 255 AND
        "base_spa" BETWEEN 1 AND 255 AND
        "base_spd" BETWEEN 1 AND 255 AND
        "base_spe" BETWEEN 1 AND 255
    ),
    CONSTRAINT "pokemons_abilities_nonempty_array" CHECK (
        CASE
            WHEN jsonb_typeof("abilities") = 'array'
            THEN jsonb_array_length("abilities") > 0
            ELSE false
        END
    ),
    CONSTRAINT "pokemons_mega_base_required" CHECK (NOT "is_mega" OR "base_pokemon_id" IS NOT NULL),
    CONSTRAINT "pokemons_not_own_base" CHECK ("base_pokemon_id" IS NULL OR "base_pokemon_id" <> "id")
);

-- CreateIndex
CREATE INDEX "pokemons_name_ja_idx" ON "pokemons"("name_ja");

-- CreateIndex
CREATE INDEX "pokemons_name_en_idx" ON "pokemons"("name_en");

-- CreateIndex
CREATE INDEX "pokemons_base_pokemon_id_idx" ON "pokemons"("base_pokemon_id");

-- CreateIndex
CREATE UNIQUE INDEX "pokemons_dex_no_form_key" ON "pokemons"("dex_no", "form");

-- AddForeignKey
ALTER TABLE "pokemons" ADD CONSTRAINT "pokemons_base_pokemon_id_fkey" FOREIGN KEY ("base_pokemon_id") REFERENCES "pokemons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
