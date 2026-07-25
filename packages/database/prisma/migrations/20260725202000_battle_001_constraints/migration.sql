-- BattleSession values are text for compatibility with the repository-wide enum policy,
-- while PostgreSQL CHECK constraints protect persisted values.
ALTER TABLE "battle_sessions"
ADD CONSTRAINT "battle_sessions_status_valid"
CHECK ("status" IN ('active', 'ended', 'archived')),
ADD CONSTRAINT "battle_sessions_result_valid"
CHECK ("result" IS NULL OR "result" IN ('win', 'lose', 'unknown')),
ADD CONSTRAINT "battle_sessions_ended_at_valid"
CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

-- BATTLE-002 will write observations. BATTLE-001 establishes only their durable shape.
ALTER TABLE "observations"
ADD CONSTRAINT "observations_seq_positive"
CHECK ("seq" > 0),
ADD CONSTRAINT "observations_kind_valid"
CHECK ("kind" IN ('pokemon', 'move', 'item', 'ability', 'position', 'mega')),
ADD CONSTRAINT "observations_position_valid"
CHECK ("position" IS NULL OR "position" IN ('lead', 'back')),
ADD CONSTRAINT "observations_payload_valid"
CHECK (
    (
        "kind" = 'pokemon'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NULL
        AND "item_id" IS NULL
        AND "ability_id" IS NULL
        AND "position" IS NULL
    )
    OR (
        "kind" = 'move'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NOT NULL
        AND "item_id" IS NULL
        AND "ability_id" IS NULL
        AND "position" IS NULL
    )
    OR (
        "kind" = 'item'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NULL
        AND "item_id" IS NOT NULL
        AND "ability_id" IS NULL
        AND "position" IS NULL
    )
    OR (
        "kind" = 'ability'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NULL
        AND "item_id" IS NULL
        AND "ability_id" IS NOT NULL
        AND "position" IS NULL
    )
    OR (
        "kind" = 'position'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NULL
        AND "item_id" IS NULL
        AND "ability_id" IS NULL
        AND "position" IS NOT NULL
    )
    OR (
        "kind" = 'mega'
        AND "pokemon_id" IS NOT NULL
        AND "move_id" IS NULL
        AND "item_id" IS NULL
        AND "ability_id" IS NULL
        AND "position" IS NULL
    )
);
