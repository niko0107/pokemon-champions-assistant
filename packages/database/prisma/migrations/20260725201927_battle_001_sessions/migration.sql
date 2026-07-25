-- CreateTable
CREATE TABLE "battle_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "selected_archetype_id" UUID,
    "result" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "pokemon_id" INTEGER,
    "move_id" INTEGER,
    "item_id" INTEGER,
    "ability_id" INTEGER,
    "position" TEXT,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battle_sessions_user_id_status_idx" ON "battle_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "battle_sessions_party_id_idx" ON "battle_sessions"("party_id");

-- CreateIndex
CREATE INDEX "battle_sessions_rule_id_idx" ON "battle_sessions"("rule_id");

-- CreateIndex
CREATE INDEX "battle_sessions_selected_archetype_id_idx" ON "battle_sessions"("selected_archetype_id");

-- CreateIndex
CREATE INDEX "battle_sessions_status_started_at_idx" ON "battle_sessions"("status", "started_at");

-- CreateIndex
CREATE INDEX "observations_pokemon_id_idx" ON "observations"("pokemon_id");

-- CreateIndex
CREATE INDEX "observations_move_id_idx" ON "observations"("move_id");

-- CreateIndex
CREATE INDEX "observations_item_id_idx" ON "observations"("item_id");

-- CreateIndex
CREATE INDEX "observations_ability_id_idx" ON "observations"("ability_id");

-- CreateIndex
CREATE UNIQUE INDEX "observations_session_id_seq_key" ON "observations"("session_id", "seq");

-- AddForeignKey
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_selected_archetype_id_fkey" FOREIGN KEY ("selected_archetype_id") REFERENCES "archetypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "battle_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
