import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@pokemon-champions/database";
import type { ProblemDetails } from "@pokemon-champions/shared";
import { compare, hash } from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

const TEST_JWT_SECRET = "auth-002-unit-test-secret-at-least-32-bytes";
const TEST_REFRESH_SECRET = "auth-003-unit-test-secret-at-least-32-bytes";
const validPassword = "correct-horse-42";
const now = new Date("2026-07-25T00:00:00.000Z");
const future = new Date("2099-08-25T00:00:00.000Z");
const refreshTokenId = "98eef5f6-80c2-4273-8332-f7058778dedf";
const refreshTokenFamilyId = "c830c0c4-d3e0-47e3-a336-4239087cc485";
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
  const previousRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const previousRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN;
  const findUnique = vi.fn();
  const create = vi.fn();
  const refreshTokenFindUnique = vi.fn();
  const refreshTokenCreate = vi.fn();
  const refreshTokenUpdateMany = vi.fn();
  const transactionClient = {
    user: { create },
    refreshToken: {
      findUnique: refreshTokenFindUnique,
      create: refreshTokenCreate,
      updateMany: refreshTokenUpdateMany,
    },
  };
  const runTransaction = vi.fn(
    async (callback: (transaction: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const jwt = new JwtService();
  const service = new AuthService(
    {
      user: { findUnique, create },
      refreshToken: { create: refreshTokenCreate },
      $transaction: runTransaction,
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
    process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
    process.env.JWT_REFRESH_EXPIRES_IN = "30d";
    findUnique.mockReset();
    create.mockReset();
    refreshTokenFindUnique.mockReset();
    refreshTokenCreate.mockReset();
    refreshTokenUpdateMany.mockReset();
    runTransaction.mockClear();
    refreshTokenCreate.mockResolvedValue({ id: "5ec96f58-8cc6-49e3-8ee7-93f05ecf752c" });
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
    expect(response.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const refreshCreateArgs = refreshTokenCreate.mock.calls[0]?.[0];
    expect(refreshCreateArgs.data.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(refreshCreateArgs.data.tokenHash).not.toBe(response.refreshToken);
    expect(refreshCreateArgs.data.userId).toBe(publicUser.id);
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
    expect(refreshTokenCreate).toHaveBeenCalledOnce();
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
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("有効なrefresh tokenをローテーションし、新tokenで再度更新できる", async () => {
    const oldRefreshToken = "a".repeat(43);
    refreshTokenFindUnique.mockResolvedValueOnce({
      id: refreshTokenId,
      familyId: refreshTokenFamilyId,
      expiresAt: future,
      revokedAt: null,
      user: publicUser,
    });
    refreshTokenUpdateMany.mockResolvedValueOnce({ count: 1 });

    const firstResponse = await service.refresh({ refreshToken: oldRefreshToken });

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: {
        id: refreshTokenId,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(firstResponse.refreshToken).not.toBe(oldRefreshToken);
    expect(firstResponse).not.toHaveProperty("tokenHash");
    expect(firstResponse.user).not.toHaveProperty("passwordHash");
    expect(refreshTokenCreate.mock.calls[0]?.[0].data).toMatchObject({
      userId: publicUser.id,
      familyId: refreshTokenFamilyId,
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(refreshTokenCreate.mock.calls[0]?.[0].data.tokenHash).not.toBe(
      firstResponse.refreshToken,
    );

    refreshTokenFindUnique.mockResolvedValueOnce({
      id: "39bf4b13-1bc5-4841-b65d-9df077a49908",
      familyId: refreshTokenFamilyId,
      expiresAt: future,
      revokedAt: null,
      user: publicUser,
    });
    refreshTokenUpdateMany.mockResolvedValueOnce({ count: 1 });

    const secondResponse = await service.refresh({
      refreshToken: firstResponse.refreshToken,
    });

    expect(secondResponse.refreshToken).not.toBe(firstResponse.refreshToken);
    expect(refreshTokenCreate).toHaveBeenCalledTimes(2);
  });

  it("期限切れ・不正・失効済みtokenを同じ401にする", async () => {
    const invalidRefreshToken = "b".repeat(43);
    const expiredRefreshToken = "c".repeat(43);
    const revokedRefreshToken = "d".repeat(43);
    refreshTokenFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: refreshTokenId,
        familyId: refreshTokenFamilyId,
        expiresAt: new Date("2000-01-01T00:00:00.000Z"),
        revokedAt: null,
        user: publicUser,
      })
      .mockResolvedValueOnce({
        id: refreshTokenId,
        familyId: refreshTokenFamilyId,
        expiresAt: future,
        revokedAt: new Date("2026-07-25T00:00:00.000Z"),
        user: publicUser,
      });
    refreshTokenUpdateMany.mockResolvedValue({ count: 1 });

    const errors = await Promise.all([
      service.refresh({ refreshToken: invalidRefreshToken }).catch((error: unknown) => error),
      service.refresh({ refreshToken: expiredRefreshToken }).catch((error: unknown) => error),
      service.refresh({ refreshToken: revokedRefreshToken }).catch((error: unknown) => error),
    ]);

    for (const error of errors) {
      expect(error).toMatchObject({
        status: 401,
        response: {
          title: "Invalid Refresh Token",
          status: 401,
          code: "INVALID_REFRESH_TOKEN",
        },
      });
      expect(JSON.stringify(error)).not.toContain("tokenHash");
    }
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("旧token再利用時は同じ系列の有効tokenを全失効する", async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: refreshTokenId,
      familyId: refreshTokenFamilyId,
      expiresAt: future,
      revokedAt: new Date("2026-07-25T00:00:00.000Z"),
      user: publicUser,
    });
    refreshTokenUpdateMany.mockResolvedValue({ count: 2 });

    await expect(service.refresh({ refreshToken: "e".repeat(43) })).rejects.toMatchObject({
      status: 401,
      response: { code: "INVALID_REFRESH_TOKEN" },
    });

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { familyId: refreshTokenFamilyId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("同時refreshの条件付き更新競合では1件だけ生成し、系列を安全に失効する", async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: refreshTokenId,
      familyId: refreshTokenFamilyId,
      expiresAt: future,
      revokedAt: null,
      user: publicUser,
    });
    refreshTokenUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const results = await Promise.allSettled([
      service.refresh({ refreshToken: "f".repeat(43) }),
      service.refresh({ refreshToken: "f".repeat(43) }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(refreshTokenCreate).toHaveBeenCalledOnce();
    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { familyId: refreshTokenFamilyId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
