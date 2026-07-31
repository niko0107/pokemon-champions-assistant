-- PARTY-003: Pokémon Championsの能力ポイントを従来EVと分離して保存する。
ALTER TABLE "party_pokemons"
  ADD COLUMN "stat_points" JSONB,
  ALTER COLUMN "evs" DROP NOT NULL;

ALTER TABLE "party_pokemons"
  ADD CONSTRAINT "party_pokemons_stat_points_object"
  CHECK ("stat_points" IS NULL OR jsonb_typeof("stat_points") = 'object');
