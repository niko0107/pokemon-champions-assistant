import { type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  adminArchetypePopularitySchema,
  API_PREFIX,
  problemDetailsSchema,
  type AdminArchetypePopularity,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AdminArchetypesService } from "../src/modules/admin-archetypes/admin-archetypes.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "archetype-003-api-access-secret-at-least-32-bytes";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const popularityResult: AdminArchetypePopularity = adminArchetypePopularitySchema.parse({
  id: archetypeId,
  popularityTier: "high",
  popularityScore: null,
  encounterCount: 5,
  pickCount: 2,
  updatedAt: "2026-07-26T00:00:00.000Z",
});

describe("ARCHETYPE-003 admin archetype popularity API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let adminToken: string;
  let userToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const updatePopularity = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        pokemon: { findMany: vi.fn().mockResolvedValue([]) },
      })
      .overrideProvider(AdminArchetypesService)
      .useValue({ updatePopularity })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    jwt = moduleRef.get(JwtService);
    adminToken = await jwt.signAsync(
      { sub: adminId, role: "admin" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
    userToken = await jwt.signAsync(
      { sub: userId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    updatePopularity.mockResolvedValue(popularityResult);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("adminが人気度を更新できる", async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ popularityTier: "high", encounterCount: 5, pickCount: 2 })
      .expect(200);

    expect(adminArchetypePopularitySchema.parse(response.body)).toEqual(popularityResult);
    expect(updatePopularity).toHaveBeenCalledWith(archetypeId, {
      popularityTier: "high",
      encounterCount: 5,
      pickCount: 2,
    });
  });

  it("不正なpopularityTierを400 VALIDATION_ERRORにする", async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ popularityTier: "sss" })
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(updatePopularity).not.toHaveBeenCalled();
  });

  it("負のencounterCountを400にする", async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ popularityTier: "high", encounterCount: -1 })
      .expect(400);
    expect(updatePopularity).not.toHaveBeenCalled();
  });

  it("存在しない構築を404 NOT_FOUNDにする", async () => {
    updatePopularity.mockRejectedValueOnce(
      new NotFoundException({
        type: "about:blank",
        title: "Archetype Not Found",
        status: 404,
        code: "NOT_FOUND",
      }),
    );

    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ popularityTier: "high" })
      .expect(404);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("AuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .send({ popularityTier: "high" })
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(updatePopularity).not.toHaveBeenCalled();
  });

  it("user roleはRFC 9457形式の403にする", async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}/popularity`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ popularityTier: "high" })
      .expect(403);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
    });
    expect(updatePopularity).not.toHaveBeenCalled();
  });

  it("既存のhealthと公開マスタ検索は認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
