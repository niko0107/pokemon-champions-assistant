import { BadRequestException, type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  adminArchetypeDetailSchema,
  adminArchetypeWriteSchema,
  API_PREFIX,
  problemDetailsSchema,
  type AdminArchetypeDetail,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AdminArchetypesService } from "../src/modules/admin-archetypes/admin-archetypes.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "archetype-002-api-access-secret-at-least-32-bytes";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";
const timestamp = "2026-07-25T00:00:00.000Z";

const writeInput = adminArchetypeWriteSchema.parse({
  name: "展開構築",
  description: "起点を作る",
  seasonId: 1,
  ruleId: 1,
  defaultLeads: [1],
  playstyleNotes: "先発から展開する",
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      itemAlternatives: [],
      abilityId: 30,
      role: "lead",
      moves: [{ moveId: 40 }],
    },
  ],
  sources: [
    {
      title: "構築記事",
      url: "https://example.com/archetype",
      siteName: "Example",
    },
  ],
});

const detail: AdminArchetypeDetail = adminArchetypeDetailSchema.parse({
  ...writeInput,
  id: archetypeId,
  popularityTier: "mid",
  popularityScore: null,
  encounterCount: 0,
  pickCount: 0,
  publishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});

describe("ARCHETYPE-002 admin archetype CRUD API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let adminToken: string;
  let userToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const list = vi.fn();
  const get = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const archive = vi.fn();
  const pokemonFindMany = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        pokemon: { findMany: pokemonFindMany },
      })
      .overrideProvider(AdminArchetypesService)
      .useValue({ list, get, create, update, archive })
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
    list.mockResolvedValue([
      {
        id: archetypeId,
        name: detail.name,
        description: detail.description,
        seasonId: detail.seasonId,
        ruleId: detail.ruleId,
        popularityTier: detail.popularityTier,
        status: detail.status,
        publishedAt: detail.publishedAt,
        updatedAt: detail.updatedAt,
      },
    ]);
    get.mockResolvedValue(detail);
    create.mockResolvedValue(detail);
    update.mockResolvedValue({ ...detail, name: "更新後の構築" });
    archive.mockResolvedValue(undefined);
    pokemonFindMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("adminが作成・取得・一覧・PUT全置換・アーカイブできる", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(writeInput)
      .expect(201);
    expect(adminArchetypeDetailSchema.parse(created.body).id).toBe(archetypeId);

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/admin/archetypes/${archetypeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(fetched.body).toEqual(detail);

    const listed = await request(app.getHttpServer())
      .get("/api/v1/admin/archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/admin/archetypes/${archetypeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...writeInput, name: "更新後の構築" })
      .expect(200);
    expect(updated.body.name).toBe("更新後の構築");

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/archetypes/${archetypeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);

    expect(create).toHaveBeenCalledWith(writeInput);
    expect(get).toHaveBeenCalledWith(archetypeId);
    expect(update).toHaveBeenCalledWith(
      archetypeId,
      expect.objectContaining({ name: "更新後の構築" }),
    );
    expect(archive).toHaveBeenCalledWith(archetypeId);
  });

  it("AuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/archetypes").expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("user roleはRFC 9457形式の403にする", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/admin/archetypes")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("存在しない構築をRFC 9457形式の404にする", async () => {
    get.mockRejectedValueOnce(
      new NotFoundException({
        type: "about:blank",
        title: "Archetype Not Found",
        status: 404,
        code: "NOT_FOUND",
      }),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/archetypes/${archetypeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("不正なマスタ参照をRFC 9457形式の400にする", async () => {
    create.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
        errors: [{ path: "seasonId", message: "指定されたシーズンは存在しません" }],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(writeInput)
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
    });
  });

  it("子要素重複をDB呼び出し前にRFC 9457形式の400にする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        ...writeInput,
        pokemons: [writeInput.pokemons[0], writeInput.pokemons[0]],
      })
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("既存のhealthと公開マスタ検索は認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
