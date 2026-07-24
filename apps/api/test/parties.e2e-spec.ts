import { BadRequestException, type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  API_PREFIX,
  partyDetailSchema,
  partyListResponseSchema,
  partyWriteSchema,
  problemDetailsSchema,
  type PartyDetail,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PartiesService } from "../src/modules/parties/parties.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "party-002-api-access-secret-at-least-32-bytes";
const userAId = "fecccd4a-a137-4b3b-bb09-239306040706";
const userBId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const adminId = "b9d3f03f-3c2f-4435-937c-8cfdbf89bb53";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const timestamp = "2026-07-25T00:00:00.000Z";

const writeInput = partyWriteSchema.parse({
  name: "ランク用",
  description: "シングル用",
  ruleId: 1,
  isActive: true,
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      abilityId: 30,
      nature: "ようき",
      teraType: "みず",
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      moves: [
        { slot: 1, moveId: 40 },
        { slot: 2, moveId: 41 },
        { slot: 3, moveId: 42 },
        { slot: 4, moveId: 43 },
      ],
    },
  ],
});

const detail: PartyDetail = partyDetailSchema.parse({
  ...writeInput,
  id: partyId,
  createdAt: timestamp,
  updatedAt: timestamp,
});

function partyNotFound(): NotFoundException {
  return new NotFoundException({
    type: "about:blank",
    title: "Party Not Found",
    status: 404,
    code: "NOT_FOUND",
  });
}

describe("PARTY-002 party CRUD API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const list = vi.fn();
  const get = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
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
      .overrideProvider(PartiesService)
      .useValue({ list, get, create, update, remove })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    jwt = moduleRef.get(JwtService);
    userAToken = await jwt.signAsync(
      { sub: userAId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
    userBToken = await jwt.signAsync(
      { sub: userBId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
    adminToken = await jwt.signAsync(
      { sub: adminId, role: "admin" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    list.mockImplementation((callerId: string) =>
      Promise.resolve(
        callerId === userAId
          ? [
              {
                id: detail.id,
                name: detail.name,
                description: detail.description,
                ruleId: detail.ruleId,
                isActive: detail.isActive,
                createdAt: detail.createdAt,
                updatedAt: detail.updatedAt,
              },
            ]
          : [],
      ),
    );
    get.mockImplementation((callerId: string) =>
      callerId === userAId ? Promise.resolve(detail) : Promise.reject(partyNotFound()),
    );
    create.mockImplementation((callerId: string) =>
      Promise.resolve({ ...detail, id: callerId === userAId ? partyId : partyId }),
    );
    update.mockImplementation((callerId: string) =>
      callerId === userAId
        ? Promise.resolve({ ...detail, name: "更新後のパーティ" })
        : Promise.reject(partyNotFound()),
    );
    remove.mockImplementation((callerId: string) =>
      callerId === userAId ? Promise.resolve() : Promise.reject(partyNotFound()),
    );
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

  it("認証ユーザーが作成・一覧・取得・PUT全置換・削除できる", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .send(writeInput)
      .expect(201);
    expect(partyDetailSchema.parse(created.body).id).toBe(partyId);

    const listed = await request(app.getHttpServer())
      .get("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    expect(partyListResponseSchema.parse(listed.body).items).toHaveLength(1);

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/parties/${partyId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    expect(fetched.body).toEqual(detail);

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/parties/${partyId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ ...writeInput, name: "更新後のパーティ" })
      .expect(200);
    expect(updated.body.name).toBe("更新後のパーティ");

    await request(app.getHttpServer())
      .delete(`/api/v1/parties/${partyId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(204);

    expect(create).toHaveBeenCalledWith(userAId, writeInput);
    expect(list).toHaveBeenCalledWith(userAId);
    expect(get).toHaveBeenCalledWith(userAId, partyId);
    expect(update).toHaveBeenCalledWith(
      userAId,
      partyId,
      expect.objectContaining({ name: "更新後のパーティ" }),
    );
    expect(remove).toHaveBeenCalledWith(userAId, partyId);
  });

  it("AuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/parties").expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("他人のパーティの取得・更新・削除を同じ404にする", async () => {
    for (const operation of [
      () =>
        request(app.getHttpServer())
          .get(`/api/v1/parties/${partyId}`)
          .set("Authorization", `Bearer ${userBToken}`),
      () =>
        request(app.getHttpServer())
          .put(`/api/v1/parties/${partyId}`)
          .set("Authorization", `Bearer ${userBToken}`)
          .send(writeInput),
      () =>
        request(app.getHttpServer())
          .delete(`/api/v1/parties/${partyId}`)
          .set("Authorization", `Bearer ${userBToken}`),
    ]) {
      const response = await operation().expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("adminでもユーザー用APIでは他人のパーティを取得できない", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/parties/${partyId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(get).toHaveBeenCalledWith(adminId, partyId);
  });

  it("userId入力と子要素重複をDB呼び出し前に400へする", async () => {
    const userIdResponse = await request(app.getHttpServer())
      .post("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ ...writeInput, userId: userBId })
      .expect(400);
    expect(problemDetailsSchema.parse(userIdResponse.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });

    const duplicateResponse = await request(app.getHttpServer())
      .post("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({
        ...writeInput,
        pokemons: [writeInput.pokemons[0], writeInput.pokemons[0]],
      })
      .expect(400);
    expect(problemDetailsSchema.parse(duplicateResponse.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("不正なRule・技・特性をRFC 9457形式の400にする", async () => {
    create.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
        errors: [{ path: "ruleId", message: "指定されたルールは存在しません" }],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .send(writeInput)
      .expect(400);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
    });
  });

  it("既存のhealthと公開マスタ検索は認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
