import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@pokemon-champions/database";
import { API_PREFIX, authResponseSchema, problemDetailsSchema } from "@pokemon-champions/shared";
import { compare } from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_JWT_SECRET = "auth-002-api-test-secret-at-least-32-bytes";
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

describe("AUTH-002 register/login APIs", () => {
  let app: INestApplication;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN;
  const users = new Map<string, StoredUser>();
  const userFindUnique = vi.fn();
  const userCreate = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
    process.env.JWT_ACCESS_EXPIRES_IN = "15m";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        user: {
          findUnique: userFindUnique,
          create: userCreate,
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  beforeEach(() => {
    users.clear();
    userFindUnique.mockReset();
    userCreate.mockReset();
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

    const stored = users.get("trainer@example.com");
    expect(stored?.passwordHash).not.toBe(validPassword);
    await expect(compare(validPassword, stored?.passwordHash ?? "")).resolves.toBe(true);
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
  ])("%sはRFC 9457形式の400を返す", async (_label, path, body) => {
    const response = await request(app.getHttpServer()).post(path).send(body).expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("既存health APIを維持する", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
  });
});
