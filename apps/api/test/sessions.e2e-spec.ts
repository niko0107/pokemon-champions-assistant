import { BadRequestException, type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  API_PREFIX,
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  observationResponseSchema,
  partyListResponseSchema,
  problemDetailsSchema,
  type BattleSessionResponse,
  type ObservationCreate,
  type ObservationResponse,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { SessionsService } from "../src/modules/sessions/sessions.service";

const TEST_ACCESS_SECRET = "battle-001-api-access-secret-at-least-32-bytes";
const userAId = "fecccd4a-a137-4b3b-bb09-239306040706";
const userBId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const adminId = "b9d3f03f-3c2f-4435-937c-8cfdbf89bb53";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const missingPartyId = "ff1b9151-ae43-4241-b227-ca878a0f31e5";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const missingSessionId = "a97f085e-72fc-49e4-a860-a871587309d7";
const observationId = "86ce163f-9d78-4776-b00b-34598734a7cd";
const timestamp = "2026-07-26T00:00:00.000Z";

const input = battleSessionCreateSchema.parse({ partyId, ruleId: 1 });
const session: BattleSessionResponse = battleSessionResponseSchema.parse({
  id: sessionId,
  partyId,
  ruleId: 1,
  status: "active",
  startedAt: timestamp,
  endedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const observationInputs = [
  { kind: "pokemon", pokemonId: 1 },
  { kind: "move", pokemonId: 1, moveId: 2 },
  { kind: "item", pokemonId: 1, itemId: 3 },
  { kind: "ability", pokemonId: 1, abilityId: 4 },
  { kind: "position", pokemonId: 1, position: "lead" },
  { kind: "mega", pokemonId: 1 },
] as const satisfies readonly ObservationCreate[];

function makeObservation(input: ObservationCreate, seq = 1): ObservationResponse {
  return observationResponseSchema.parse({
    id: observationId,
    sessionId,
    seq,
    kind: input.kind,
    pokemonId: input.pokemonId,
    moveId: input.kind === "move" ? input.moveId : null,
    itemId: input.kind === "item" ? input.itemId : null,
    abilityId: input.kind === "ability" ? input.abilityId : null,
    position: input.kind === "position" ? input.position : null,
    isRevoked: false,
    createdAt: timestamp,
  });
}

function notFound(): NotFoundException {
  return new NotFoundException({
    type: "about:blank",
    title: "Session Resource Not Found",
    status: 404,
    code: "NOT_FOUND",
  });
}

describe("BATTLE-001/002 session API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const create = vi.fn();
  const get = vi.fn();
  const addObservation = vi.fn();
  const pokemonFindMany = vi.fn();
  const partyFindMany = vi.fn();

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
        party: { findMany: partyFindMany },
      })
      .overrideProvider(SessionsService)
      .useValue({ create, get, addObservation })
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
    create.mockImplementation((callerId: string, requestInput: { partyId: string }) => {
      if (callerId !== userAId || requestInput.partyId !== partyId) {
        return Promise.reject(notFound());
      }
      return Promise.resolve(session);
    });
    get.mockImplementation((callerId: string) =>
      callerId === userAId ? Promise.resolve(session) : Promise.reject(notFound()),
    );
    addObservation.mockImplementation(
      (callerId: string, requestedSessionId: string, requestInput: ObservationCreate) =>
        callerId === userAId && requestedSessionId === sessionId
          ? Promise.resolve(makeObservation(requestInput))
          : Promise.reject(notFound()),
    );
    pokemonFindMany.mockResolvedValue([]);
    partyFindMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("認証ユーザーが自分のPartyでセッションを作成・取得できる", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${userAToken}`)
      .send(input)
      .expect(201);
    expect(battleSessionResponseSchema.parse(created.body)).toEqual(session);
    expect(created.body).not.toHaveProperty("userId");
    expect(created.body).not.toHaveProperty("passwordHash");
    expect(created.body).not.toHaveProperty("accessToken");

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    expect(battleSessionResponseSchema.parse(fetched.body)).toEqual(session);
    expect(create).toHaveBeenCalledWith(userAId, input);
    expect(get).toHaveBeenCalledWith(userAId, sessionId);
  });

  it("AuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/sessions")
      .send(input)
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("他人・admin・存在しないPartyを外部から区別できない404にする", async () => {
    for (const [token, requestInput] of [
      [userBToken, input],
      [adminToken, input],
      [userAToken, { ...input, partyId: missingPartyId }],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post("/api/v1/sessions")
        .set("Authorization", `Bearer ${token}`)
        .send(requestInput)
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toEqual({
        type: "about:blank",
        title: "Session Resource Not Found",
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("不正UUID・userId入力を400 VALIDATION_ERRORにする", async () => {
    for (const requestInput of [
      { partyId: "not-a-uuid", ruleId: 1 },
      { ...input, userId: userBId },
    ]) {
      const response = await request(app.getHttpServer())
        .post("/api/v1/sessions")
        .set("Authorization", `Bearer ${userAToken}`)
        .send(requestInput)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("不正なParty状態をRFC 9457形式の400にする", async () => {
    create.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Party State",
        status: 400,
        code: "INVALID_PARTY_STATE",
        errors: [{ path: "partyId", message: "activeなパーティが必要です" }],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${userAToken}`)
      .send(input)
      .expect(400);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_PARTY_STATE",
    });
  });

  it("他人または存在しないセッション取得を同じ404にする", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${userBToken}`)
      .expect(404);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it.each(observationInputs)("%s観測を自分のSessionへ追加できる", async (observationInput) => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send(observationInput)
      .expect(201);

    expect(observationResponseSchema.parse(response.body)).toEqual(
      makeObservation(observationInput),
    );
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(addObservation).toHaveBeenCalledWith(userAId, sessionId, observationInput);
  });

  it("観測追加のAuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .send(observationInputs[0])
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(addObservation).not.toHaveBeenCalled();
  });

  it("他人・admin・不存在Sessionを外部から区別できない404にする", async () => {
    for (const [token, requestedSessionId] of [
      [userBToken, sessionId],
      [adminToken, sessionId],
      [userAToken, missingSessionId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${requestedSessionId}/observations`)
        .set("Authorization", `Bearer ${token}`)
        .send(observationInputs[0])
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("契約外フィールドとkind別payload違反を400 VALIDATION_ERRORにする", async () => {
    for (const invalidInput of [
      { kind: "pokemon", pokemonId: 1, seq: 1 },
      { kind: "pokemon", pokemonId: 1, isRevoked: false },
      { kind: "move", pokemonId: 1 },
      { kind: "position", pokemonId: 1, position: "ace" },
    ]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(invalidInput)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(addObservation).not.toHaveBeenCalled();
  });

  it("ended/archived Sessionを400 INVALID_SESSION_STATEにする", async () => {
    addObservation.mockRejectedValue(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Session State",
        status: 400,
        code: "INVALID_SESSION_STATE",
      }),
    );

    for (const _status of ["ended", "archived"]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(observationInputs[0])
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "INVALID_SESSION_STATE",
      });
    }
  });

  it("不正マスタ参照をRFC 9457形式の400にする", async () => {
    addObservation.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
      }),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send(observationInputs[0])
      .expect(400);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
    });
  });

  it("既存health・Party一覧・公開マスタ検索を壊さない", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });

    const parties = await request(app.getHttpServer())
      .get("/api/v1/parties")
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    expect(partyListResponseSchema.parse(parties.body)).toEqual({ items: [] });

    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200, { items: [] });
  });
});
