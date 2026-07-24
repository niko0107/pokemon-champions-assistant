-- CreateTable
CREATE TABLE "moves" (
    "id" SERIAL NOT NULL,
    "name_ja" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "power" INTEGER,
    "accuracy" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "moves_required_text_not_blank" CHECK (
        btrim("name_ja") <> '' AND
        btrim("name_en") <> '' AND
        btrim("type") <> '' AND
        btrim("category") <> ''
    ),
    CONSTRAINT "moves_category_allowed" CHECK (
        "category" IN ('physical', 'special', 'status')
    ),
    CONSTRAINT "moves_power_range" CHECK (
        "power" IS NULL OR "power" BETWEEN 1 AND 300
    ),
    CONSTRAINT "moves_accuracy_range" CHECK (
        "accuracy" IS NULL OR "accuracy" BETWEEN 1 AND 100
    ),
    CONSTRAINT "moves_priority_range" CHECK (
        "priority" BETWEEN -7 AND 5
    ),
    CONSTRAINT "moves_tags_array" CHECK (
        jsonb_typeof("tags") = 'array'
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "moves_name_ja_key" ON "moves"("name_ja");

-- CreateIndex
CREATE UNIQUE INDEX "moves_name_en_key" ON "moves"("name_en");

-- CreateIndex
CREATE INDEX "moves_tags_idx" ON "moves" USING GIN ("tags");
