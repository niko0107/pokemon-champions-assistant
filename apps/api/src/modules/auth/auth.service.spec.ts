import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@pokemon-champions/database";
import type { ProblemDetails } from "@pokemon-champions/shared";
import { compare, hash } from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

const TEST_JWT_SECRET = "auth-002-unit-test-secret-at-least-32-bytes";
const validPassword = "correct-horse-42";
const now = new Date("2026-07-25T00:00:00.000Z");
const publicUser = {
  id: "fecccd4a-a137-4b3b-bb09-239306040706",
  email: "trainer@example.com",
  displayName: "Trainer",
  role: "user",
  createdAt: now,
  updatedAt: now,
};

describe("AuthService", () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN;
  const findUnique = vi.fn();
  const create = vi.fn();
  const jwt = new JwtService();
  const service = new AuthService(
    {
      user: { findUnique, create },
    } as unknown as PrismaService,
    jwt,
  );
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await hash(validPassword, 12);
  });

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
    process.env.JWT_ACCESS_EXPIRES_IN = "15m";
    findUnique.mockReset();
    create.mockReset();
  });

  afterAll(() => {
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

  it("登録時にbcrypt hashだけをuser roleで保存し、公開情報とJWTを返す", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue(publicUser);

    const response = await service.register({
      email: "trainer@example.com",
      password: validPassword,
      displayName: "Trainer",
    });

    const createArgs = create.mock.calls[0]?.[0];
    expect(createArgs.data).toMatchObject({
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "user",
    });
    expect(createArgs.data.passwordHash).not.toBe(validPassword);
    await expect(compare(validPassword, createArgs.data.passwordHash)).resolves.toBe(true);
    expect(response.user).toEqual({
      ...publicUser,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(response.user).not.toHaveProperty("passwordHash");
    await expect(
      jwt.verifyAsync(response.accessToken, { secret: TEST_JWT_SECRET }),
    ).resolves.toMatchObject({
      sub: publicUser.id,
      role: "user",
    });
  });

  it("既存emailは409にし、hash生成・作成へ進まない", async () => {
    findUnique.mockResolvedValue({ id: publicUser.id });

    await expect(
      service.register({
        email: publicUser.email,
        password: validPassword,
        displayName: publicUser.displayName,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "EMAIL_ALREADY_REGISTERED",
      } satisfies Partial<ProblemDetails>,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("同時登録によるPrisma P2002も409へ変換する", async () => {
    findUnique.mockResolvedValue(null);
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { modelName: "User", target: ["email"] },
      }),
    );

    await expect(
      service.register({
        email: publicUser.email,
        password: validPassword,
        displayName: publicUser.displayName,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "EMAIL_ALREADY_REGISTERED",
      } satisfies Partial<ProblemDetails>,
    });
  });

  it("正しいemailとpasswordでログインし、JWTを返す", async () => {
    findUnique.mockResolvedValue({ ...publicUser, passwordHash: validPasswordHash });

    const response = await service.login({
      email: publicUser.email,
      password: validPassword,
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: publicUser.email },
      select: expect.objectContaining({ passwordHash: true }),
    });
    expect(response.user).not.toHaveProperty("passwordHash");
    await expect(
      jwt.verifyAsync(response.accessToken, { secret: TEST_JWT_SECRET }),
    ).resolves.toMatchObject({
      sub: publicUser.id,
      role: "user",
    });
  });

  it("パスワード不一致とユーザー不存在を同じ401にする", async () => {
    findUnique
      .mockResolvedValueOnce({ ...publicUser, passwordHash: validPasswordHash })
      .mockResolvedValueOnce(null);

    const wrongPasswordError = await service
      .login({ email: publicUser.email, password: "wrong-password-42" })
      .catch((error: unknown) => error);
    const missingUserError = await service
      .login({ email: "missing@example.com", password: "wrong-password-42" })
      .catch((error: unknown) => error);

    const expectedError = {
      status: 401,
      response: {
        title: "Invalid Credentials",
        status: 401,
        code: "INVALID_CREDENTIALS",
      },
    };
    expect(wrongPasswordError).toMatchObject(expectedError);
    expect(missingUserError).toMatchObject(expectedError);
  });

  it("JWT秘密鍵が不正な場合はDB変更前に安全な500を返す", async () => {
    process.env.JWT_ACCESS_SECRET = "too-short";

    await expect(
      service.register({
        email: publicUser.email,
        password: validPassword,
        displayName: publicUser.displayName,
      }),
    ).rejects.toMatchObject({
      status: 500,
      response: {
        title: "Authentication Service Unavailable",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
