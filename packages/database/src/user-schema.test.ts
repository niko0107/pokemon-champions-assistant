import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./index";

describe("AUTH-001 User Prisma model", () => {
  const userModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "User");
  const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
  const migrationDirectory = readdirSync(migrationsDirectory, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_auth_001_users"),
  );

  if (!userModel) {
    throw new Error("Generated Prisma Client does not contain the User model");
  }
  if (!migrationDirectory) {
    throw new Error("AUTH-001 migration does not exist");
  }

  const migration = readFileSync(
    new URL(`${migrationDirectory.name}/migration.sql`, migrationsDirectory),
    "utf8",
  );
  const fields = Object.fromEntries(
    userModel.fields.map((field) => [
      field.name,
      {
        type: field.type,
        required: field.isRequired,
        unique: field.isUnique,
        id: field.isId,
        updatedAt: field.isUpdatedAt,
        default: field.default,
      },
    ]),
  );

  it("usersテーブルをUUID主キーと仕様上の全フィールドで定義する", () => {
    expect(userModel.dbName).toBe("users");
    expect(userModel.fields.map((field) => field.name)).toEqual([
      "id",
      "email",
      "passwordHash",
      "displayName",
      "role",
      "createdAt",
      "updatedAt",
      "refreshTokens",
    ]);
    expect(fields).toMatchObject({
      id: { type: "String", required: true, id: true },
      email: { type: "String", required: true, unique: true },
      passwordHash: { type: "String", required: false, unique: false },
      displayName: { type: "String", required: true },
      role: { type: "String", required: true, default: "user" },
      createdAt: { type: "DateTime", required: true },
      updatedAt: { type: "DateTime", required: true, updatedAt: true },
      refreshTokens: { type: "RefreshToken", required: true },
    });
    expect(migration).toContain('"id" UUID NOT NULL');
    expect(migration).toContain('"password_hash" VARCHAR(255)');
    expect(migration).toContain('"created_at" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"updated_at" TIMESTAMPTZ(3) NOT NULL');
  });

  it("emailを正規化済みのVARCHAR(254)として一意にする", () => {
    expect(migration).toContain('"email" VARCHAR(254) NOT NULL');
    expect(migration).toContain('CONSTRAINT "users_email_normalized"');
    expect(migration).toContain('"email" = lower(btrim("email"))');
    expect(migration).toContain('CREATE UNIQUE INDEX "users_email_key" ON "users"("email")');
    expect(migration).not.toContain("CREATE EXTENSION");
    expect(migration).not.toContain("CITEXT");
  });

  it("表示名、passwordHash、roleにDB制約を持つ", () => {
    expect(migration).toContain('CONSTRAINT "users_display_name_valid"');
    expect(migration).toContain('char_length("display_name") BETWEEN 1 AND 50');
    expect(migration).toContain('CONSTRAINT "users_password_hash_valid"');
    expect(migration).toContain('char_length("password_hash") BETWEEN 1 AND 255');
    expect(migration).toContain('CONSTRAINT "users_role_valid"');
    expect(migration).toContain("\"role\" IN ('user', 'admin')");
  });

  it("role既定値とtimestamp初期値をmigrationに含む", () => {
    expect(migration).toContain("\"role\" TEXT NOT NULL DEFAULT 'user'");
    expect(migration).toContain('"created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(migration).toContain('"updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
  });

  it("既存モデルを維持する", () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(
      expect.arrayContaining([
        "SystemHealthCheck",
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
