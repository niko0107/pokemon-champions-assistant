-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "name_ja" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "effect_tags" JSONB NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "items_required_text_not_blank" CHECK (
        btrim("name_ja") <> '' AND
        btrim("name_en") <> ''
    ),
    CONSTRAINT "items_effect_tags_array" CHECK (
        jsonb_typeof("effect_tags") = 'array'
    )
);

-- CreateTable
CREATE TABLE "abilities" (
    "id" SERIAL NOT NULL,
    "name_ja" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "effect_tags" JSONB NOT NULL,

    CONSTRAINT "abilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "abilities_required_text_not_blank" CHECK (
        btrim("name_ja") <> '' AND
        btrim("name_en") <> ''
    ),
    CONSTRAINT "abilities_effect_tags_array" CHECK (
        jsonb_typeof("effect_tags") = 'array'
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "items_name_ja_key" ON "items"("name_ja");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_en_key" ON "items"("name_en");

-- CreateIndex
CREATE INDEX "items_effect_tags_idx" ON "items" USING GIN ("effect_tags");

-- CreateIndex
CREATE UNIQUE INDEX "abilities_name_ja_key" ON "abilities"("name_ja");

-- CreateIndex
CREATE UNIQUE INDEX "abilities_name_en_key" ON "abilities"("name_en");

-- CreateIndex
CREATE INDEX "abilities_effect_tags_idx" ON "abilities" USING GIN ("effect_tags");
