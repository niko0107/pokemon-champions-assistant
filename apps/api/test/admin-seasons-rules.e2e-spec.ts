import { type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  adminRuleListResponseSchema,
  adminRuleSchema,
  adminSeasonArchiveResponseSchema,
  adminSeasonListResponseSchema,
  adminSeasonSchema,
  API_PREFIX,
  problemDetailsSchema,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AdminSeasonsRulesService } from "../src/modules/admin-archetypes/admin-seasons-rules.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "archetype-003-seasons-access-secret-at-least-32-bytes";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";

const season = { id: 1, name: "シーズン12", startsAt: "2026-01-01", endsAt: "2026-03-31" };
const rule = { id: 1, name: "シングル", teamSize: 6, pickSize: 3 };

describe("ARCHETYPE-003 admin seasons/rules API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let adminToken: string;
  let userToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const listSeasons = vi.fn();
  const createSeason = vi.fn();
  const listRules = vi.fn();
  const createRule = vi.fn();
  const archiveArchetypesBySeason = vi.fn();

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
      .overrideProvider(AdminSeasonsRulesService)
      .useValue({ listSeasons, createSeason, listRules, createRule, archiveArchetypesBySeason })
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
    listSeasons.mockResolvedValue([season]);
    createSeason.mockResolvedValue(season);
    listRules.mockResolvedValue([rule]);
    createRule.mockResolvedValue(rule);
    archiveArchetypesBySeason.mockResolvedValue({ seasonId: 1, archivedCount: 2 });
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("adminがシーズンを一覧・作成できる", async () => {
    const listed = await request(app.getHttpServer())
      .get("/api/v1/admin/seasons")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(adminSeasonListResponseSchema.parse(listed.body).items).toHaveLength(1);

    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/seasons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "シーズン12", startsAt: "2026-01-01", endsAt: "2026-03-31" })
      .expect(201);
    expect(adminSeasonSchema.parse(created.body)).toEqual(season);
    expect(createSeason).toHaveBeenCalledWith({
      name: "シーズン12",
      startsAt: "2026-01-01",
      endsAt: "2026-03-31",
    });
  });

  it("adminがルールを一覧・作成できる", async () => {
    const listed = await request(app.getHttpServer())
      .get("/api/v1/admin/rules")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(adminRuleListResponseSchema.parse(listed.body).items).toHaveLength(1);

    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/rules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "シングル", teamSize: 6, pickSize: 3 })
      .expect(201);
    expect(adminRuleSchema.parse(created.body)).toEqual(rule);
  });

  it("シーズン終了時に構築を一括アーカイブできる", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/seasons/1/archive-archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(adminSeasonArchiveResponseSchema.parse(response.body)).toEqual({
      seasonId: 1,
      archivedCount: 2,
    });
    expect(archiveArchetypesBySeason).toHaveBeenCalledWith(1);
  });

  it("存在しないシーズンの一括アーカイブを404にする", async () => {
    archiveArchetypesBySeason.mockRejectedValueOnce(
      new NotFoundException({
        type: "about:blank",
        title: "Season Not Found",
        status: 404,
        code: "NOT_FOUND",
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/seasons/999/archive-archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("pickSize>teamSizeのルール作成を400 VALIDATION_ERRORにする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/rules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "不整合", teamSize: 3, pickSize: 6 })
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(createRule).not.toHaveBeenCalled();
  });

  it("終了日<開始日のシーズン作成を400にする", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/admin/seasons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "S", startsAt: "2026-03-31", endsAt: "2026-01-01" })
      .expect(400);
    expect(createSeason).not.toHaveBeenCalled();
  });

  it("不正なシーズンIDパラメータを400にする", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/admin/seasons/abc/archive-archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    expect(archiveArchetypesBySeason).not.toHaveBeenCalled();
  });

  it("Authorizationなしのシーズン・ルールAPIはすべて401にする", async () => {
    const server = app.getHttpServer();
    const cases: ["get" | "post", string][] = [
      ["get", "/api/v1/admin/seasons"],
      ["post", "/api/v1/admin/seasons"],
      ["get", "/api/v1/admin/rules"],
      ["post", "/api/v1/admin/rules"],
      ["post", "/api/v1/admin/seasons/1/archive-archetypes"],
    ];

    for (const [method, path] of cases) {
      const response = await request(server)[method](path).expect(401);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    }

    expect(listSeasons).not.toHaveBeenCalled();
    expect(createSeason).not.toHaveBeenCalled();
    expect(listRules).not.toHaveBeenCalled();
    expect(createRule).not.toHaveBeenCalled();
    expect(archiveArchetypesBySeason).not.toHaveBeenCalled();
  });

  it("userロールは403にする", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/admin/seasons")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(listSeasons).not.toHaveBeenCalled();
  });

  it("health・公開マスタ検索は認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
