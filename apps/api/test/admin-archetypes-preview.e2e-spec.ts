import { BadRequestException, type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  adminArchetypePreviewResponseSchema,
  adminArchetypeWriteSchema,
  API_PREFIX,
  problemDetailsSchema,
  type AdminArchetypePreviewResponse,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AdminArchetypesService } from "../src/modules/admin-archetypes/admin-archetypes.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "archetype-005-api-access-secret-at-least-32-bytes";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const duplicateId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const previewInput = adminArchetypeWriteSchema.parse({
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
      abilityId: 30,
      actualStats: {
        hp: 215,
        attack: 132,
        defense: 187,
        specialAttack: 88,
        specialDefense: 93,
        speed: 67,
      },
      role: "lead",
      moves: [{ moveId: 40 }],
    },
  ],
  sources: [{ title: "記事", url: "https://example.com/a", siteName: "Example" }],
});

const previewResult: AdminArchetypePreviewResponse = adminArchetypePreviewResponseSchema.parse({
  exactDuplicate: true,
  exactDuplicateArchetypeId: duplicateId,
  candidates: [
    {
      archetypeId: duplicateId,
      name: "展開構築",
      matchRate: 100,
      rank: 1,
      popularityTier: "mid",
      matched: [{ observationSeq: 1, kind: "pokemon", matched: true, points: 10, pokemonId: 10 }],
      contradictions: [],
      exclusionCodes: [],
      likelyUnseen: [],
      threatMoveIds: [],
    },
  ],
});

describe("ARCHETYPE-005 admin archetype preview API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let adminToken: string;
  let userToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const preview = vi.fn();

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
      .useValue({ preview })
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
    preview.mockResolvedValue(previewResult);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("adminはプレビューを200で取得できる", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(previewInput)
      .expect(200);

    expect(adminArchetypePreviewResponseSchema.parse(response.body)).toEqual(previewResult);
    expect(preview).toHaveBeenCalledWith(previewInput);
  });

  it("AuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .send(previewInput)
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(preview).not.toHaveBeenCalled();
  });

  it("user roleはRFC 9457形式の403にする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .set("Authorization", `Bearer ${userToken}`)
      .send(previewInput)
      .expect(403);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
    });
    expect(preview).not.toHaveBeenCalled();
  });

  it("不正入力はDB呼び出し前にRFC 9457形式の400 VALIDATION_ERRORにする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...previewInput, sources: [] })
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(preview).not.toHaveBeenCalled();
  });

  it("actualStats不足をDB呼び出し前に400にする", async () => {
    const { actualStats: _actualStats, ...pokemon } = previewInput.pokemons[0]!;
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...previewInput, pokemons: [pokemon] })
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(preview).not.toHaveBeenCalled();
  });

  it("不正なマスタ参照はRFC 9457形式の400 INVALID_MASTER_REFERENCEにする", async () => {
    preview.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
        errors: [{ path: "seasonId", message: "指定されたシーズンは存在しません" }],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/archetypes/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(previewInput)
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
    });
  });

  it("既存のhealthと公開マスタ検索はプレビュー追加後も認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
