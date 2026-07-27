import { type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  API_PREFIX,
  problemDetailsSchema,
  publicArchetypeDetailSchema,
  type PublicArchetypeDetail,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { ArchetypesService } from "../src/modules/archetypes/archetypes.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "web-008-api-access-secret-at-least-32-bytes";
const archetypeId = "30000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const detail: PublicArchetypeDetail = {
  id: archetypeId,
  name: "リザードン展開",
  description: "公開構築の説明",
  rule: { id: 1, name: "シングルバトル", teamSize: 6, pickSize: 3, battleLevel: 50 },
  season: { id: 1, name: "シーズン1" },
  defaultLeads: [1, 2, 3],
  playstyleNotes: "先発から展開する",
  pokemons: Array.from({ length: 6 }, (_, index) => ({
    slot: index + 1,
    usageRate: 1,
    nature: null,
    teraType: null,
    evs: null,
    actualStats: null,
    role: index === 0 ? ("lead" as const) : ("support" as const),
    threatNotes: index === 0 ? "積み展開に注意" : null,
    pokemon: {
      id: index + 1,
      nameJa: `ポケモン${index + 1}`,
      nameEn: `Pokemon ${index + 1}`,
      form: "normal",
      type1: "fire" as const,
      type2: null,
      isMega: false,
    },
    item: index === 0 ? { id: 1, nameJa: "きあいのタスキ", nameEn: "Focus Sash" } : null,
    ability: null,
    moves: [
      {
        moveId: index + 1,
        nameJa: `技${index + 1}`,
        nameEn: `Move ${index + 1}`,
        type: "fire" as const,
        category: "special" as const,
        power: 90,
        accuracy: 100,
        priority: 0,
        tags: [],
        adoptionRate: 1,
      },
    ],
  })),
  sources: [
    {
      title: "公式大会結果",
      url: "https://example.com/source",
      siteName: "Example",
    },
  ],
};

describe("GET /api/v1/archetypes/:id", () => {
  let app: INestApplication;
  let accessToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const get = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(ArchetypesService)
      .useValue({ get })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    accessToken = await moduleRef
      .get(JwtService)
      .signAsync(
        { sub: userId, role: "user" },
        { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
      );
  });

  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue(detail);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("認証済みユーザーへstrictな公開詳細だけを200で返す", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/archetypes/${archetypeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(publicArchetypeDetailSchema.parse(response.body)).toEqual(detail);
    expect(get).toHaveBeenCalledWith(archetypeId);
    expect(response.body.pokemons).toHaveLength(6);
    expect(response.body).not.toHaveProperty("status");
    expect(response.body).not.toHaveProperty("createdAt");
    expect(response.body).not.toHaveProperty("popularityScore");
  });

  it("Authorizationなしは共通401にし、Serviceを呼ばない", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/archetypes/${archetypeId}`)
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("不正IDを400 VALIDATION_ERRORにし、Serviceを呼ばない", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/archetypes/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(400);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["不存在", "archivedまたはその他の非公開状態"])(
    "%sは同じ404 NOT_FOUNDを返す",
    async () => {
      get.mockRejectedValue(
        new NotFoundException({
          type: "about:blank",
          title: "Archetype Not Found",
          status: 404,
          code: "NOT_FOUND",
        }),
      );

      const response = await request(app.getHttpServer())
        .get(`/api/v1/archetypes/${archetypeId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(404);

      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    },
  );

  it("health・auth・Session関連ルートを破壊しない", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer()).post("/api/v1/auth/login").send({}).expect(400);
    await request(app.getHttpServer()).get(`/api/v1/sessions/${archetypeId}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${archetypeId}/candidates`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${archetypeId}/counterplan`)
      .expect(401);
  });
});
