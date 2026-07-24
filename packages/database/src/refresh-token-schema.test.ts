import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("AUTH-003 RefreshToken Prisma model", () => {
  const refreshTokenModel = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "RefreshToken",
  );
  const userModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "User");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_auth_003_refresh_tokens"),
  );

  if (!refreshTokenModel) {
    throw new Error("Generated Prisma Client does not contain the RefreshToken model");
  }
  if (!userModel) {
    throw new Error("Generated Prisma Client does not contain the User model");
  }
  if (!migrationDirectory) {
    throw new Error("AUTH-003 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );
  const fields = Object.fromEntries(
    refreshTokenModel.fields.map((field) => [
      field.name,
      {
        type: field.type,
        required: field.isRequired,
        unique: field.isUnique,
        id: field.isId,
      },
    ]),
  );

  it("opaque tokenのhashと系列・期限・失効状態だけを保持する", () => {
    expect(refreshTokenModel.dbName).toBe("refresh_tokens");
    expect(refreshTokenModel.fields.map((field) => field.name)).toEqual([
      "id",
      "userId",
      "tokenHash",
      "familyId",
      "expiresAt",
      "revokedAt",
      "createdAt",
      "user",
    ]);
    expect(fields).toMatchObject({
      id: { type: "String", required: true, id: true },
      userId: { type: "String", required: true },
      tokenHash: { type: "String", required: true, unique: true },
      familyId: { type: "String", required: true },
      expiresAt: { type: "DateTime", required: true },
      revokedAt: { type: "DateTime", required: false },
      createdAt: { type: "DateTime", required: true },
      user: { type: "User", required: true },
    });
    expect(refreshTokenModel.fields.some((field) => field.name === "token")).toBe(false);
  });

  it("UserとのCASCADE外部キーと検索用インデックスを持つ", () => {
    expect(userModel.fields.some((field) => field.name === "refreshTokens")).toBe(true);
    expect(migration).toContain(
      'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash")',
    );
    expect(migration).toContain(
      'CREATE INDEX "refresh_tokens_family_id_revoked_at_idx" ON "refresh_tokens"("family_id", "revoked_at")',
    );
    expect(migration).toContain(
      'CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at")',
    );
    expect(migration).toContain(
      'CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at")',
    );
  });

  it("hash形式・有効期限・失効日時をDB CHECKで保証する", () => {
    expect(migration).toContain('CONSTRAINT "refresh_tokens_token_hash_valid"');
    expect(migration).toContain("\"token_hash\" ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain('CONSTRAINT "refresh_tokens_expiry_valid"');
    expect(migration).toContain('"expires_at" > "created_at"');
    expect(migration).toContain('CONSTRAINT "refresh_tokens_revocation_valid"');
    expect(migration).toContain('"revoked_at" IS NULL OR "revoked_at" >= "created_at"');
  });

  it("既存モデルを維持する", () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(
      expect.arrayContaining([
        "SystemHealthCheck",
        "User",
        "Pokemon",
        "Move",
        "Item",
        "Ability",
        "PokemonMove",
        "Season",
        "Rule",
      ]),
    );
  });
});
