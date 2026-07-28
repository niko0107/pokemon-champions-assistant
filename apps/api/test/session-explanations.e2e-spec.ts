import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@pokemon-champions/database";
import {
  API_PREFIX,
  problemDetailsSchema,
  sessionCounterplanExplanationStatusResponseSchema,
  sessionCounterplanResponseSchema,
  type SessionCounterplanExplanationStatusResponse,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthModule } from "../src/modules/auth/auth.module";
import {
  ANTHROPIC_CONFIG,
  type AnthropicExplanationConfig,
} from "../src/modules/explanations/anthropic-explanation.config";
import {
  ANTHROPIC_MESSAGES_CLIENT,
  type AnthropicExplanationMessageResponse,
} from "../src/modules/explanations/anthropic-messages.client";
import { COUNTERPLAN_EXPLANATION_STATUS } from "../src/modules/explanations/counterplan-explanation-status";
import { ExplanationsModule } from "../src/modules/explanations/explanations.module";
import { PrismaModule } from "../src/modules/prisma/prisma.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { BattleRateLimitGuard } from "../src/modules/sessions/battle-rate-limit.guard";
import { BattleRateLimitService } from "../src/modules/sessions/battle-rate-limit.service";
import { SessionCounterplanService } from "../src/modules/sessions/session-counterplan.service";
import { SessionsController } from "../src/modules/sessions/sessions.controller";
import { SessionsService } from "../src/modules/sessions/sessions.service";

const TEST_ACCESS_SECRET = "llm-001-e2e-access-secret-at-least-32-bytes";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const actualStats = {
  hp: 180,
  attack: 120,
  defense: 110,
  specialAttack: 140,
  specialDefense: 120,
  speed: 100,
};

function sessionRecord(status = "active", selected = true) {
  return {
    id: sessionId,
    userId,
    status,
    ruleId: 1,
    partyId,
    selectedArchetypeId: selected ? archetypeId : null,
    rule: {
      id: 1,
      teamSize: 1,
      pickSize: 1,
      battleLevel: 50,
    },
    party: {
      id: partyId,
      ruleId: 1,
      pokemons: [
        {
          slot: 1,
          pokemonId: 1,
          actualStats,
          pokemon: { type1: "water", type2: null, isMega: false },
          moves: [
            {
              slot: 1,
              moveId: 11,
              move: {
                type: "water",
                category: "special",
                power: 90,
                accuracy: 100,
                priority: 0,
                tags: [],
              },
            },
          ],
        },
      ],
    },
    selectedArchetype: selected
      ? {
          id: archetypeId,
          ruleId: 1,
          status: "published",
          playstyleNotes: "壁から展開する",
          defaultLeads: [1],
          rule: { id: 1, battleLevel: 50 },
          pokemons: [
            {
              slot: 1,
              pokemonId: 101,
              role: "sweeper",
              usageRate: new Prisma.Decimal("1"),
              actualStats,
              threatNotes: "積み展開に注意",
              pokemon: { type1: "fire", type2: null, isMega: false },
              moves: [
                {
                  moveId: 21,
                  adoptionRate: new Prisma.Decimal("1"),
                  move: {
                    type: "fire",
                    category: "physical",
                    power: 80,
                    accuracy: 100,
                    priority: 0,
                    tags: [],
                  },
                },
                {
                  moveId: 22,
                  adoptionRate: new Prisma.Decimal("0.8"),
                  move: {
                    type: "normal",
                    category: "status",
                    power: null,
                    accuracy: 100,
                    priority: 0,
                    tags: ["setup"],
                  },
                },
              ],
            },
          ],
        }
      : null,
    observations: [],
  };
}

describe("LLM-001 counterplan explanation API", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let token: string;
  let otherToken: string;
  let record: ReturnType<typeof sessionRecord> | null;
  const findFirst = vi.fn();
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  let explanationStatus: SessionCounterplanExplanationStatusResponse = {
    status: "unavailable",
    explanation: null,
  };
  const getCounterplanExplanationStatus = vi.fn(async () => explanationStatus);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    delete process.env.ANTHROPIC_API_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ExplanationsModule],
      controllers: [SessionsController],
      providers: [
        SessionCounterplanService,
        {
          provide: SessionsService,
          useValue: {},
        },
        {
          provide: BattleRateLimitGuard,
          useValue: { canActivate: () => true },
        },
        {
          provide: BattleRateLimitService,
          useValue: { consumeObservation: vi.fn() },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ battleSession: { findFirst } })
      .overrideProvider(COUNTERPLAN_EXPLANATION_STATUS)
      .useValue({ getCounterplanExplanationStatus })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    jwt = moduleRef.get(JwtService);
    token = await jwt.signAsync(
      { sub: userId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
    otherToken = await jwt.signAsync(
      { sub: otherUserId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  beforeEach(() => {
    record = sessionRecord();
    findFirst.mockReset();
    findFirst.mockImplementation(({ where }: { where: { id: string; userId: string } }) =>
      where.id === sessionId && where.userId === userId ? Promise.resolve(record) : null,
    );
    explanationStatus = { status: "unavailable", explanation: null };
    getCounterplanExplanationStatus.mockClear();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
    if (previousAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey;
    }
  });

  it("APIキー未設定でも200で決定的なテンプレ説明と既存構造を返す", async () => {
    const first = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = sessionCounterplanResponseSchema.parse(first.body);
    expect(parsed.explanation).toMatchObject({
      summary: "相手ポケモン1体への対策です。警戒技は1件、未対応の相手は0体です。",
      selectionExplanation: expect.stringContaining("ポケモンID 1"),
      perOpponent: [
        {
          opponentPokemonId: 101,
          explanation: expect.stringContaining("ポケモンID 101"),
        },
      ],
      strategyExplanation: expect.stringContaining("積み技を自由に使わせない。"),
    });
    expect(second.body.explanation).toEqual(first.body.explanation);
    expect(parsed.perOpponent).toHaveLength(1);
    expect(parsed.selection.selectedPokemonIds).toEqual([1]);
    expect(parsed.strategyCodes).toEqual(["PREVENT_SETUP"]);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it.each(["ready", "pending", "failed", "unavailable"] as const)(
    "生成済み説明取得APIがstrictな%s状態を200で返す",
    async (status) => {
      explanationStatus =
        status === "ready"
          ? {
              status,
              explanation: {
                summary: "生成済み説明です。",
                selectionExplanation: "生成済み選出説明です。",
                perOpponent: [{ opponentPokemonId: 101, explanation: "生成済み対面説明です。" }],
                strategyExplanation: null,
              },
            }
          : { status, explanation: null };

      const response = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${sessionId}/counterplan/explanation`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(sessionCounterplanExplanationStatusResponseSchema.parse(response.body)).toEqual(
        explanationStatus,
      );
      expect(response.body).not.toHaveProperty("cacheKey");
      expect(response.body).not.toHaveProperty("provider");
      expect(response.body).not.toHaveProperty("failureReason");
    },
  );

  it("生成済み説明取得APIも未認証401・他人404・archived/未選択400を維持する", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan/explanation`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan/explanation`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/v1/sessions/not-a-uuid/counterplan/explanation")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/sessions/11111111-1111-4111-8111-111111111111/counterplan/explanation")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    record = sessionRecord("archived");
    const archived = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan/explanation`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(problemDetailsSchema.parse(archived.body).code).toBe("INVALID_SESSION_STATE");

    record = sessionRecord("active", false);
    const unselected = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan/explanation`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(problemDetailsSchema.parse(unselected.body).code).toBe("INVALID_ARCHETYPE_SELECTION");
  });

  it("endedは成功し、未認証・他人・archived・selected未設定の既存エラーを維持する", async () => {
    record = sessionRecord("ended");
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer()).get(`/api/v1/sessions/${sessionId}/counterplan`).expect(401);

    const other = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);
    expect(problemDetailsSchema.parse(other.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    record = sessionRecord("archived");
    const archived = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(problemDetailsSchema.parse(archived.body)).toMatchObject({
      status: 400,
      code: "INVALID_SESSION_STATE",
    });

    record = sessionRecord("active", false);
    const unselected = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(problemDetailsSchema.parse(unselected.body)).toMatchObject({
      status: 400,
      code: "INVALID_ARCHETYPE_SELECTION",
    });
  });

  it("不正な構造化入力を秘密情報なしの500にする", async () => {
    record = sessionRecord();
    record.selectedArchetype!.pokemons[0]!.moves[0]!.move.category = "unknown";
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(500);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
    });
    expect(response.body).not.toHaveProperty("stack");
    expect(JSON.stringify(response.body)).not.toContain("unknown");
  });
});

describe("LLM-003 counterplan immediate response", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let token: string;
  let record: ReturnType<typeof sessionRecord> | null;
  const findFirst = vi.fn();
  const createExplanationMessage = vi.fn();
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousRedisUrl = process.env.REDIS_URL;
  const anthropicConfig: AnthropicExplanationConfig = {
    enabled: true,
    apiKey: "test-api-key-not-sent-to-network",
    model: "claude-sonnet-4-5-20250929",
    timeoutMs: 1_000,
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    delete process.env.REDIS_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ExplanationsModule],
      controllers: [SessionsController],
      providers: [
        SessionCounterplanService,
        {
          provide: SessionsService,
          useValue: {},
        },
        {
          provide: BattleRateLimitGuard,
          useValue: { canActivate: () => true },
        },
        {
          provide: BattleRateLimitService,
          useValue: { consumeObservation: vi.fn() },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ battleSession: { findFirst } })
      .overrideProvider(ANTHROPIC_CONFIG)
      .useValue(anthropicConfig)
      .overrideProvider(ANTHROPIC_MESSAGES_CLIENT)
      .useValue({ createExplanationMessage })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    jwt = moduleRef.get(JwtService);
    token = await jwt.signAsync(
      { sub: userId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  beforeEach(() => {
    record = sessionRecord();
    findFirst.mockReset();
    findFirst.mockResolvedValue(record);
    createExplanationMessage.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
  });

  function anthropicResponse(
    content: string,
    stopReason = "end_turn",
  ): AnthropicExplanationMessageResponse {
    return {
      stopReason,
      content: [{ type: "text", text: content }],
    };
  }

  function validAnthropicExplanation() {
    return {
      summary: "構造化された対策結果を短く説明します。",
      selectionExplanation: "選出と先発は計算済みの結果どおりです。",
      perOpponent: [
        {
          opponentPokemonId: 101,
          explanation: "ポケモンID 101には計算済み1位候補で対応します。",
        },
      ],
      strategyExplanation: "積み展開を許さない方針です。",
    };
  }

  it("Anthropic設定済みでもRedis/Queue未設定ならAnthropicを待たずTemplateを返す", async () => {
    createExplanationMessage.mockResolvedValue(
      anthropicResponse(JSON.stringify(validAnthropicExplanation())),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = sessionCounterplanResponseSchema.parse(response.body);
    expect(parsed.explanation.summary).toBe(
      "相手ポケモン1体への対策です。警戒技は1件、未対応の相手は0体です。",
    );
    expect(parsed.perOpponent).toHaveLength(1);
    expect(parsed.perOpponent[0]?.opponentPokemonId).toBe(101);
    expect(parsed.selection.selectedPokemonIds).toEqual([1]);
    expect(parsed.strategyCodes).toEqual(["PREVENT_SETUP"]);
    expect(createExplanationMessage).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["timeout", () => new Anthropic.APIConnectionTimeoutError()],
    [
      "429",
      () =>
        Anthropic.APIError.generate(
          429,
          { type: "error", error: { type: "rate_limit_error", message: "limited" } },
          "limited",
          new Headers(),
        ),
    ],
  ])("%s時は既存構造を維持してTemplateへフォールバックする", async (_label, error) => {
    createExplanationMessage.mockRejectedValue(error());

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = sessionCounterplanResponseSchema.parse(response.body);
    expect(parsed.explanation.summary).toBe(
      "相手ポケモン1体への対策です。警戒技は1件、未対応の相手は0体です。",
    );
    expect(parsed.perOpponent[0]?.opponentPokemonId).toBe(101);
    expect(parsed.selection.selectedPokemonIds).toEqual([1]);
    expect(createExplanationMessage).not.toHaveBeenCalled();
  });

  it("不正JSON時は壊れた出力を採用せずTemplateへフォールバックする", async () => {
    createExplanationMessage.mockResolvedValue(anthropicResponse("{broken"));

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sessionId}/counterplan`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = sessionCounterplanResponseSchema.parse(response.body);
    expect(parsed.explanation.summary).toBe(
      "相手ポケモン1体への対策です。警戒技は1件、未対応の相手は0体です。",
    );
    expect(parsed.perOpponent[0]?.opponentPokemonId).toBe(101);
    expect(parsed.selection.selectedPokemonIds).toEqual([1]);
    expect(createExplanationMessage).not.toHaveBeenCalled();
  });
});
