-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(50) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized" CHECK (
        char_length("email") BETWEEN 3 AND 254
        AND "email" = lower(btrim("email"))
    ),
    CONSTRAINT "users_display_name_valid" CHECK (
        char_length("display_name") BETWEEN 1 AND 50
        AND "display_name" = btrim("display_name")
    ),
    CONSTRAINT "users_password_hash_valid" CHECK (
        "password_hash" IS NULL
        OR (
            char_length("password_hash") BETWEEN 1 AND 255
            AND "password_hash" = btrim("password_hash")
        )
    ),
    CONSTRAINT "users_role_valid" CHECK (
        "role" IN ('user', 'admin')
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
