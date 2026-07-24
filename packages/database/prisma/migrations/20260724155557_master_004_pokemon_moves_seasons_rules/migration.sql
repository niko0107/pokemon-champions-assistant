-- CreateTable
CREATE TABLE "pokemon_moves" (
    "pokemon_id" INTEGER NOT NULL,
    "move_id" INTEGER NOT NULL,

    CONSTRAINT "pokemon_moves_pkey" PRIMARY KEY ("pokemon_id","move_id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seasons_required_text_not_blank" CHECK (
        btrim("name") <> ''
    ),
    CONSTRAINT "seasons_date_order" CHECK (
        "ends_at" >= "starts_at"
    )
);

-- CreateTable
CREATE TABLE "rules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "team_size" INTEGER NOT NULL,
    "pick_size" INTEGER NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rules_required_text_not_blank" CHECK (
        btrim("name") <> ''
    ),
    CONSTRAINT "rules_team_size_range" CHECK (
        "team_size" BETWEEN 1 AND 6
    ),
    CONSTRAINT "rules_pick_size_range" CHECK (
        "pick_size" BETWEEN 1 AND 6
    ),
    CONSTRAINT "rules_pick_not_greater_than_team" CHECK (
        "pick_size" <= "team_size"
    )
);

-- CreateIndex
CREATE INDEX "pokemon_moves_move_id_idx" ON "pokemon_moves"("move_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_name_key" ON "seasons"("name");

-- CreateIndex
CREATE INDEX "seasons_starts_at_ends_at_idx" ON "seasons"("starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "rules_name_key" ON "rules"("name");

-- AddForeignKey
ALTER TABLE "pokemon_moves" ADD CONSTRAINT "pokemon_moves_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_moves" ADD CONSTRAINT "pokemon_moves_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
