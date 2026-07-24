import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@pokemon-champions/database";
import { API_PREFIX, authResponseSchema, problemDetailsSchema } from "@pokemon-champions/shared";
import { compare } from "bcrypt";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_JWT_SECRET = "auth-002-api-test-secret-at-least-32-bytes";
const TEST_REFRESH_SECRET = "auth-003-api-test-secret-at-least-32-bytes";
const validPassword = "correct-horse-42";
const now = new Date("2026-07-25T00:00:00.000Z");

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

describe("AUTH-002/003 authentication APIs", () => {
  let app: INestApplication;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN;
  const previousRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const previousRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN;
  const users = new Map<string, StoredUser>();
  const refreshTokens = new Map<string, StoredRefreshToken>();
  const userFindUnique = vi.fn();
  const userCreate = vi.fn();
  const refreshTokenFindUnique = vi.fn();
  const refreshTokenCreate = vi.fn();
  const refreshTokenUpdateMany = vi.fn();
  const runTransaction = vi.fn();
  const prismaMock = {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: userFindUnique,
      create: userCreate,
    },
    refreshToken: {
      findUnique: refreshTokenFindUnique,
      create: refreshTokenCreate,
      updateMany: refreshTokenUpdateMany,
    },
    $transaction: runTransaction,
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
    process.env.JWT_ACCESS_EXPIRES_IN = "15m";
    process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
    process.env.JWT_REFRESH_EXPIRES_IN = "30d";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  beforeEach(() => {
    users.clear();
    refreshTokens.clear();
    userFindUnique.mockReset();
    userCreate.mockReset();
    refreshTokenFindUnique.mockReset();
    refreshTokenCreate.mockReset();
    refreshTokenUpdateMany.mockReset();
    runTransaction.mockReset();
    userFindUnique.mockImplementation(
      ({ where }: { where: { email: string } }) => users.get(where.email) ?? null,
    );
    userCreate.mockImplementation(
      ({
        data,
      }: {
        data: {
          email: string;
          passwordHash: string;
          displayName: string;
          role: string;
        };
      }) => {
        if (users.has(data.email)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.19.3",
            meta: { modelName: "User", target: ["email"] },
          });
        }

        const user: StoredUser = {
          id: "fecccd4a-a137-4b3b-bb09-239306040706",
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        users.set(user.email, user);
        const { passwordHash: _passwordHash, ...publicUser } = user;
        return publicUser;
      },
    );
    refreshTokenCreate.mockImplementation(
      ({
        data,
      }: {
        data: {
          userId: string;
          tokenHash: string;
          familyId: string;
          expiresAt: Date;
        };
      }) => {
        const storedToken: StoredRefreshToken = {
          id: randomUUID(),
          ...data,
          revokedAt: null,
          createdAt: new Date(),
        };
        refreshTokens.set(storedToken.tokenHash, storedToken);
        return { id: storedToken.id };
      },
    );
    refreshTokenFindUnique.mockImplementation(({ where }: { where: { tokenHash: string } }) => {
      const storedToken = refreshTokens.get(where.tokenHash);
      if (!storedToken) {
        return null;
      }
      const user = [...users.values()].find((candidate) => candidate.id === storedToken.userId);
      if (!user) {
        return null;
      }
      const { passwordHash: _passwordHash, ...publicUser } = user;
      return { ...storedToken, user: publicUser };
    });
    refreshTokenUpdateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: {
          id?: string;
          familyId?: string;
          revokedAt?: null;
          expiresAt?: { gt: Date };
        };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const storedToken of refreshTokens.values()) {
          const matches =
            (where.id === undefined || storedToken.id === where.id) &&
            (where.familyId === undefined || storedToken.familyId === where.familyId) &&
            (where.revokedAt === undefined || storedToken.revokedAt === where.revokedAt) &&
            (where.expiresAt === undefined || storedToken.expiresAt > where.expiresAt.gt);
          if (matches) {
            storedToken.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
    );
    runTransaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
    if (previousExpiresIn === undefined) {
      delete process.env.JWT_ACCESS_EXPIRES_IN;
    } else {
      process.env.JWT_ACCESS_EXPIRES_IN = previousExpiresIn;
    }
    if (previousRefreshSecret === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = previousRefreshSecret;
    }
    if (previousRefreshExpiresIn === undefined) {
      delete process.env.JWT_REFRESH_EXPIRES_IN;
    } else {
      process.env.JWT_REFRESH_EXPIRES_IN = previousRefreshExpiresIn;
    }
  });

  it("emailを正規化してuser roleで登録し、hashと公開レスポンスを分離する", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: " Trainer@Example.COM ",
        password: validPassword,
        displayName: " Trainer ",
      })
      .expect(201);

    expect(authResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.user).toMatchObject({
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "user",
    });
    expect(response.body).not.toHaveProperty("password");
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const stored = users.get("trainer@example.com");
    expect(stored?.passwordHash).not.toBe(validPassword);
    await expect(compare(validPassword, stored?.passwordHash ?? "")).resolves.toBe(true);
    const storedRefreshToken = [...refreshTokens.values()][0];
    if (!storedRefreshToken) {
      throw new Error("Expected a stored refresh token");
    }
    expect(storedRefreshToken.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(storedRefreshToken.tokenHash).not.toBe(response.body.refreshToken);
    expect(JSON.stringify(response.body)).not.toContain(storedRefreshToken.tokenHash);
    expect(JSON.stringify(response.body)).not.toContain(TEST_REFRESH_SECRET);
  });

  it("大文字小文字・前後空白が異なる同一emailの再登録を409にする", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: "Trainer@Example.COM",
      password: validPassword,
      displayName: "Trainer",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: " trainer@example.com ",
        password: validPassword,
        displayName: "Another",
      })
      .expect(409);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
    });
    expect(users.size).toBe(1);
  });

  it("登録済みユーザーが正しいpasswordでログインできる", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: "trainer@example.com",
      password: validPassword,
      displayName: "Trainer",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: " TRAINER@EXAMPLE.COM ",
        password: validPassword,
      })
      .expect(200);

    expect(authResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.user.email).toBe("trainer@example.com");
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("refreshでtokenをローテーションし、新tokenを続けて利用できる", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "trainer@example.com",
        password: validPassword,
        displayName: "Trainer",
      })
      .expect(201);

    const firstRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: registerResponse.body.refreshToken })
      .expect(200);
    const secondRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: firstRefresh.body.refreshToken })
      .expect(200);

    expect(authResponseSchema.safeParse(firstRefresh.body).success).toBe(true);
    expect(authResponseSchema.safeParse(secondRefresh.body).success).toBe(true);
    expect(firstRefresh.body.refreshToken).not.toBe(registerResponse.body.refreshToken);
    expect(secondRefresh.body.refreshToken).not.toBe(firstRefresh.body.refreshToken);
    expect(firstRefresh.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(firstRefresh.body)).not.toContain(TEST_REFRESH_SECRET);
  });

  it("ローテーション済み旧tokenの再利用を401にし、同じ系列を全失効する", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "trainer@example.com",
        password: validPassword,
        displayName: "Trainer",
      })
      .expect(201);
    const rotatedResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: registerResponse.body.refreshToken })
      .expect(200);

    const reusedToken = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: registerResponse.body.refreshToken })
      .expect(401);
    const invalidatedSuccessor = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotatedResponse.body.refreshToken })
      .expect(401);

    expect(problemDetailsSchema.parse(reusedToken.body)).toMatchObject({
      status: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(problemDetailsSchema.parse(invalidatedSuccessor.body)).toEqual(
      problemDetailsSchema.parse(reusedToken.body),
    );
    expect(JSON.stringify(reusedToken.body)).not.toContain(TEST_REFRESH_SECRET);
  });

  it("期限切れtokenと不正tokenを共通の401にする", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "trainer@example.com",
        password: validPassword,
        displayName: "Trainer",
      })
      .expect(201);
    const storedRefreshToken = [...refreshTokens.values()][0];
    if (!storedRefreshToken) {
      throw new Error("Expected a stored refresh token");
    }
    storedRefreshToken.expiresAt = new Date("2000-01-01T00:00:00.000Z");

    const expiredToken = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: registerResponse.body.refreshToken })
      .expect(401);
    const invalidToken = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "z".repeat(43) })
      .expect(401);

    expect(problemDetailsSchema.parse(expiredToken.body)).toEqual(
      problemDetailsSchema.parse(invalidToken.body),
    );
  });

  it("パスワード不一致とユーザー不存在を共通の401にする", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: "trainer@example.com",
      password: validPassword,
      displayName: "Trainer",
    });

    const wrongPassword = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "trainer@example.com",
        password: "wrong-password-42",
      })
      .expect(401);
    const missingUser = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "missing@example.com",
        password: "wrong-password-42",
      })
      .expect(401);

    expect(problemDetailsSchema.parse(wrongPassword.body)).toEqual(
      problemDetailsSchema.parse(missingUser.body),
    );
    expect(wrongPassword.body).toMatchObject({
      title: "Invalid Credentials",
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });

  it.each([
    [
      "不正email",
      "/api/v1/auth/register",
      { email: "invalid", password: validPassword, displayName: "Trainer" },
    ],
    ["短いpassword", "/api/v1/auth/login", { email: "trainer@example.com", password: "short-1" }],
    [
      "空のdisplayName",
      "/api/v1/auth/register",
      { email: "trainer@example.com", password: validPassword, displayName: " " },
    ],
    [
      "role指定",
      "/api/v1/auth/register",
      {
        email: "trainer@example.com",
        password: validPassword,
        displayName: "Trainer",
        role: "admin",
      },
    ],
    ["不正refresh token", "/api/v1/auth/refresh", { refreshToken: "short" }],
  ])("%sはRFC 9457形式の400を返す", async (_label, path, body) => {
    const response = await request(app.getHttpServer()).post(path).send(body).expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(refreshTokenFindUnique).not.toHaveBeenCalled();
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("既存health APIを維持する", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
  });
});
