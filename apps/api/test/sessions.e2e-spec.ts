import {
  BadRequestException,
  ConflictException,
  type INestApplication,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  API_PREFIX,
  battleCandidateSelectResponseSchema,
  battleCandidatesResponseSchema,
  battleSessionEndResponseSchema,
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  observationResponseSchema,
  partyListResponseSchema,
  problemDetailsSchema,
  undoObservationResponseSchema,
  type BattleSessionResponse,
  type BattleCandidatesResponse,
  type BattleCandidateSelectResponse,
  type BattleSessionEndResponse,
  type ObservationCreate,
  type ObservationResponse,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import {
  REDIS_ADAPTER,
  type RedisAdapter,
  type RedisIncrementResult,
  type RedisOperationResult,
} from "../src/modules/redis/redis-adapter";
import { buildObservationRateLimitKey } from "../src/modules/sessions/battle-rate-limit.service";
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
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";
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

function makeRevokedObservation(): ObservationResponse {
  return {
    ...makeObservation({ kind: "move", pokemonId: 1, moveId: 2 }, 3),
    isRevoked: true,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    type: "about:blank",
    title: "Session Resource Not Found",
    status: 404,
    code: "NOT_FOUND",
  });
}

const candidatesResponse: BattleCandidatesResponse = battleCandidatesResponseSchema.parse({
  sessionId,
  candidates: [
    {
      archetypeId,
      name: "展開構築",
      matchRate: 100,
      rank: 1,
      popularityTier: "high",
      matched: [],
      contradictions: [],
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 2, usageRate: 1 }],
      threatMoveIds: [3],
    },
  ],
});

const selectedResponse: BattleCandidateSelectResponse = battleCandidateSelectResponseSchema.parse({
  sessionId,
  selectedArchetypeId: archetypeId,
  status: "active",
  updatedAt: timestamp,
});

const endedResponse: BattleSessionEndResponse = battleSessionEndResponseSchema.parse({
  sessionId,
  selectedArchetypeId: archetypeId,
  status: "ended",
  result: "win",
  endedAt: timestamp,
  updatedAt: timestamp,
});

interface RateLimitCounter {
  count: number;
  expiresAt: number;
}

class ApiRateLimitRedisAdapter implements RedisAdapter {
  available = true;
  now = 0;
  readonly counters = new Map<string, RateLimitCounter>();

  reset(): void {
    this.available = true;
    this.now = 0;
    this.counters.clear();
  }

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<RedisOperationResult<"PONG">> {
    return this.available ? { status: "ok", value: "PONG" } : { status: "unavailable" };
  }

  async get(): Promise<RedisOperationResult<string | null>> {
    return { status: "ok", value: null };
  }

  async set(): Promise<RedisOperationResult<void>> {
    return { status: "ok", value: undefined };
  }

  async setWithTtl(): Promise<RedisOperationResult<void>> {
    return { status: "ok", value: undefined };
  }

  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<RedisOperationResult<RedisIncrementResult>> {
    if (!this.available) {
      return { status: "unavailable" };
    }

    const current = this.counters.get(key);
    const counter =
      current === undefined || current.expiresAt <= this.now
        ? { count: 0, expiresAt: this.now + ttlSeconds * 1_000 }
        : current;
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      status: "ok",
      value: {
        count: counter.count,
        ttlSeconds: Math.max(0, Math.ceil((counter.expiresAt - this.now) / 1_000)),
      },
    };
  }

  async delete(): Promise<RedisOperationResult<number>> {
    return { status: "ok", value: 0 };
  }
}

describe("BATTLE-001〜006 session API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const create = vi.fn();
  const get = vi.fn();
  const addObservation = vi.fn();
  const undoObservation = vi.fn();
  const getCandidates = vi.fn();
  const selectCandidate = vi.fn();
  const end = vi.fn();
  const pokemonFindMany = vi.fn();
  const partyFindMany = vi.fn();
  const rateLimitRedis = new ApiRateLimitRedisAdapter();

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
      .useValue({
        create,
        get,
        addObservation,
        undoObservation,
        getCandidates,
        selectCandidate,
        end,
      })
      .overrideProvider(REDIS_ADAPTER)
      .useValue(rateLimitRedis)
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
    rateLimitRedis.reset();
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
    undoObservation.mockImplementation(
      (callerId: string, requestedSessionId: string, requestedObservationId: string) =>
        callerId === userAId &&
        requestedSessionId === sessionId &&
        requestedObservationId === observationId
          ? Promise.resolve(makeRevokedObservation())
          : Promise.reject(notFound()),
    );
    getCandidates.mockImplementation((callerId: string, requestedSessionId: string) =>
      callerId === userAId && requestedSessionId === sessionId
        ? Promise.resolve(candidatesResponse)
        : Promise.reject(notFound()),
    );
    selectCandidate.mockImplementation(
      (callerId: string, requestedSessionId: string, requestInput: { archetypeId: string }) =>
        callerId === userAId &&
        requestedSessionId === sessionId &&
        requestInput.archetypeId === archetypeId
          ? Promise.resolve(selectedResponse)
          : Promise.reject(notFound()),
    );
    end.mockImplementation((callerId: string, requestedSessionId: string) =>
      callerId === userAId && requestedSessionId === sessionId
        ? Promise.resolve(endedResponse)
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
    expect(rateLimitRedis.counters).toHaveLength(0);
  });

  it("観測入力はユーザー単位で60req/分まで許可し、61件目を429にする", async () => {
    for (let requestNumber = 1; requestNumber <= 60; requestNumber += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(observationInputs[0])
        .expect(201);
    }

    const exceeded = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send(observationInputs[0])
      .expect(429);

    expect(exceeded.headers["retry-after"]).toBe("60");
    expect(problemDetailsSchema.parse(exceeded.body)).toEqual({
      type: "about:blank",
      title: "Too Many Requests",
      status: 429,
      detail: "Observation request rate limit exceeded.",
      instance: `/api/v1/sessions/${sessionId}/observations`,
      code: "RATE_LIMITED",
    });
    expect(addObservation).toHaveBeenCalledTimes(60);
  });

  it("ウィンドウ経過後は観測入力を再び許可する", async () => {
    for (let requestNumber = 1; requestNumber <= 61; requestNumber += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(observationInputs[0])
        .expect(requestNumber <= 60 ? 201 : 429);
    }

    rateLimitRedis.now += 60_000;
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send(observationInputs[0])
      .expect(201);
  });

  it("別ユーザー・adminは同じルールの独立したカウンタを持つ", async () => {
    for (let requestNumber = 1; requestNumber <= 60; requestNumber += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(observationInputs[0])
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userBToken}`)
      .send(observationInputs[0])
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(observationInputs[0])
      .expect(404);

    expect(rateLimitRedis.counters.get(buildObservationRateLimitKey(userAId))?.count).toBe(60);
    expect(rateLimitRedis.counters.get(buildObservationRateLimitKey(userBId))?.count).toBe(1);
    expect(rateLimitRedis.counters.get(buildObservationRateLimitKey(adminId))?.count).toBe(1);
  });

  it("Redis未設定・停止相当でも観測入力をfail-openする", async () => {
    rateLimitRedis.available = false;

    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/observations`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send(observationInputs[0])
      .expect(201);

    expect(rateLimitRedis.counters).toHaveLength(0);
  });

  it("観測制限を超えても仕様対象外のSession APIには制限を適用しない", async () => {
    for (let requestNumber = 1; requestNumber <= 61; requestNumber += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/observations`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(observationInputs[0])
        .expect(requestNumber <= 60 ? 201 : 429);
    }

    await request(app.getHttpServer())
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${userAToken}`)
      .send(input)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/select`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ archetypeId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ result: "win" })
      .expect(200);
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

  it("自分のSessionの直近ObservationをUndoできる", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);

    expect(undoObservationResponseSchema.parse(response.body)).toEqual(makeRevokedObservation());
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(undoObservation).toHaveBeenCalledWith(userAId, sessionId, observationId);
  });

  it("UndoのAuthorizationなしはRFC 9457形式の401にする", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(undoObservation).not.toHaveBeenCalled();
  });

  it("Undoでも他人・admin・不存在Sessionを外部から区別できない404にする", async () => {
    for (const [token, requestedSessionId] of [
      [userBToken, sessionId],
      [adminToken, sessionId],
      [userAToken, missingSessionId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/sessions/${requestedSessionId}/observations/${observationId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("Undo paramsの不正UUIDを400 VALIDATION_ERRORにする", async () => {
    for (const path of [
      `/api/v1/sessions/not-a-uuid/observations/${observationId}`,
      `/api/v1/sessions/${sessionId}/observations/not-a-uuid`,
    ]) {
      const response = await request(app.getHttpServer())
        .delete(path)
        .set("Authorization", `Bearer ${userAToken}`)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(undoObservation).not.toHaveBeenCalled();
  });

  it("ended/archived SessionのUndoを400 INVALID_SESSION_STATEにする", async () => {
    undoObservation.mockRejectedValue(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Session State",
        status: 400,
        code: "INVALID_SESSION_STATE",
      }),
    );

    for (const _status of ["ended", "archived"]) {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
        .set("Authorization", `Bearer ${userAToken}`)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "INVALID_SESSION_STATE",
      });
    }
  });

  it("有効観測0件・二重Undoを409 OBSERVATION_CONFLICTにする", async () => {
    undoObservation.mockRejectedValue(
      new ConflictException({
        type: "about:blank",
        title: "Observation Conflict",
        status: 409,
        code: "OBSERVATION_CONFLICT",
      }),
    );

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(409);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 409,
      code: "OBSERVATION_CONFLICT",
    });
  });

  it("同じObservationへの同時Undoは1件だけ成功する", async () => {
    let revoked = false;
    undoObservation.mockImplementation(async () => {
      if (revoked) {
        throw new ConflictException({
          type: "about:blank",
          title: "Observation Conflict",
          status: 409,
          code: "OBSERVATION_CONFLICT",
        });
      }
      revoked = true;
      return makeRevokedObservation();
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
        .set("Authorization", `Bearer ${userAToken}`),
      request(app.getHttpServer())
        .delete(`/api/v1/sessions/${sessionId}/observations/${observationId}`)
        .set("Authorization", `Bearer ${userAToken}`),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("自分のactive Sessionの候補上位3件を取得できる", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(200);

    expect(battleCandidatesResponseSchema.parse(response.body)).toEqual(candidatesResponse);
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body.candidates[0]).not.toHaveProperty("rawScore");
    expect(response.body.candidates[0]).not.toHaveProperty("maxScore");
    expect(response.body.candidates[0]).not.toHaveProperty("excluded");
    expect(getCandidates).toHaveBeenCalledWith(userAId, sessionId);
  });

  it("候補取得の認証なし401、他人・admin・不存在Sessionは404", async () => {
    const unauthorized = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/candidates`)
      .expect(401);
    expect(problemDetailsSchema.parse(unauthorized.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });

    for (const [token, requestedSessionId] of [
      [userBToken, sessionId],
      [adminToken, sessionId],
      [userAToken, missingSessionId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${requestedSessionId}/candidates`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("ended/archived Sessionの候補取得を400 INVALID_SESSION_STATEにする", async () => {
    getCandidates.mockRejectedValue(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Session State",
        status: 400,
        code: "INVALID_SESSION_STATE",
      }),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${userAToken}`)
      .expect(400);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: "INVALID_SESSION_STATE",
    });
  });

  it("自分のactive Sessionで候補を選択できる", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/select`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ archetypeId })
      .expect(200);

    expect(battleCandidateSelectResponseSchema.parse(response.body)).toEqual(selectedResponse);
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body).not.toHaveProperty("pickCount");
    expect(selectCandidate).toHaveBeenCalledWith(userAId, sessionId, { archetypeId });
  });

  it("候補選択のstrict入力違反を400 VALIDATION_ERRORにする", async () => {
    for (const invalidInput of [{ archetypeId: "not-a-uuid" }, { archetypeId, userId: userBId }]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/select`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send(invalidInput)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(selectCandidate).not.toHaveBeenCalled();
  });

  it("候補外選択を400、再選択競合を409にする", async () => {
    selectCandidate
      .mockRejectedValueOnce(
        new BadRequestException({
          type: "about:blank",
          title: "Invalid Archetype Selection",
          status: 400,
          code: "INVALID_ARCHETYPE_SELECTION",
        }),
      )
      .mockRejectedValueOnce(
        new ConflictException({
          type: "about:blank",
          title: "Battle Conflict",
          status: 409,
          code: "BATTLE_CONFLICT",
        }),
      );

    for (const expected of [
      [400, "INVALID_ARCHETYPE_SELECTION"],
      [409, "BATTLE_CONFLICT"],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionId}/select`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send({ archetypeId })
        .expect(expected[0]);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: expected[0],
        code: expected[1],
      });
    }
  });

  it("候補選択の認証なし401、他人・admin・不存在Sessionは404", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/select`)
      .send({ archetypeId })
      .expect(401);

    for (const [token, requestedSessionId] of [
      [userBToken, sessionId],
      [adminToken, sessionId],
      [userAToken, missingSessionId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${requestedSessionId}/select`)
        .set("Authorization", `Bearer ${token}`)
        .send({ archetypeId })
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }
  });

  it("自分のactive Sessionを終了できる", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ result: "win" })
      .expect(200);

    expect(battleSessionEndResponseSchema.parse(response.body)).toEqual(endedResponse);
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(end).toHaveBeenCalledWith(userAId, sessionId, { result: "win" });
  });

  it("終了入力はstrictで、認証なしは401にする", async () => {
    const invalid = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ result: "draw", userId: userAId })
      .expect(400);
    expect(problemDetailsSchema.parse(invalid.body)).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });

    const unauthorized = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .send({})
      .expect(401);
    expect(problemDetailsSchema.parse(unauthorized.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("終了でも他人・admin・不存在Sessionを404、状態不正を400、競合を409にする", async () => {
    for (const [token, requestedSessionId] of [
      [userBToken, sessionId],
      [adminToken, sessionId],
      [userAToken, missingSessionId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${requestedSessionId}/end`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(404);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    }

    end.mockRejectedValueOnce(
      new BadRequestException({
        type: "about:blank",
        title: "Invalid Session State",
        status: 400,
        code: "INVALID_SESSION_STATE",
      }),
    );
    const invalidState = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({})
      .expect(400);
    expect(problemDetailsSchema.parse(invalidState.body)).toMatchObject({
      status: 400,
      code: "INVALID_SESSION_STATE",
    });

    end.mockRejectedValueOnce(
      new ConflictException({
        type: "about:blank",
        title: "Battle Conflict",
        status: 409,
        code: "BATTLE_CONFLICT",
      }),
    );
    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({})
      .expect(409);
    expect(problemDetailsSchema.parse(conflict.body)).toMatchObject({
      status: 409,
      code: "BATTLE_CONFLICT",
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
