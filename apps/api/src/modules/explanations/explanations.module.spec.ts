import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCounterplanService } from "../sessions/session-counterplan.service";
import { ANTHROPIC_CONFIG, type AnthropicExplanationConfig } from "./anthropic-explanation.config";
import {
  ANTHROPIC_MESSAGES_CLIENT,
  OfficialAnthropicMessagesClient,
  type AnthropicMessagesClient,
} from "./anthropic-messages.client";
import { CachedExplanationOrchestrator } from "./cached-explanation-orchestrator";
import { EXPLANATION_GENERATOR, type ExplanationGenerator } from "./explanation-generator";
import { ExplanationsModule } from "./explanations.module";

describe("ExplanationsModule DI", () => {
  const previous = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
    timeout: process.env.ANTHROPIC_TIMEOUT_MS,
    redisUrl: process.env.REDIS_URL,
    cacheTtl: process.env.LLM_EXPLANATION_CACHE_TTL_SECONDS,
  };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_TIMEOUT_MS;
    delete process.env.REDIS_URL;
    delete process.env.LLM_EXPLANATION_CACHE_TTL_SECONDS;
  });

  afterEach(() => {
    for (const [name, value] of [
      ["ANTHROPIC_API_KEY", previous.apiKey],
      ["ANTHROPIC_MODEL", previous.model],
      ["ANTHROPIC_TIMEOUT_MS", previous.timeout],
      ["REDIS_URL", previous.redisUrl],
      ["LLM_EXPLANATION_CACHE_TTL_SECONDS", previous.cacheTtl],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it.each([undefined, "", "   "])(
    "ANTHROPIC_API_KEY=%sでも最終Fallback実装を解決し、clientを作らない",
    async (apiKey) => {
      if (apiKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = apiKey;
      }
      const moduleRef = await Test.createTestingModule({
        imports: [ExplanationsModule],
      }).compile();

      expect(moduleRef.get<ExplanationGenerator>(EXPLANATION_GENERATOR)).toBeInstanceOf(
        CachedExplanationOrchestrator,
      );
      expect(moduleRef.get<AnthropicExplanationConfig>(ANTHROPIC_CONFIG)).toEqual({
        enabled: false,
        reason: "api_key_missing",
      });
      expect(moduleRef.get(ANTHROPIC_MESSAGES_CLIENT)).toBeNull();
      await moduleRef.close();
    },
  );

  it("APIキー・model・timeout設定時に公式clientと最終Fallback実装を解決する", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-5";
    process.env.ANTHROPIC_TIMEOUT_MS = "5000";
    const moduleRef = await Test.createTestingModule({
      imports: [ExplanationsModule],
    }).compile();

    expect(moduleRef.get(EXPLANATION_GENERATOR)).toBeInstanceOf(CachedExplanationOrchestrator);
    expect(moduleRef.get(ANTHROPIC_MESSAGES_CLIENT)).toBeInstanceOf(
      OfficialAnthropicMessagesClient,
    );
    expect(moduleRef.get<AnthropicExplanationConfig>(ANTHROPIC_CONFIG)).toEqual({
      enabled: true,
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      timeoutMs: 5_000,
    });
    await moduleRef.close();
  });

  it("SessionCounterplanServiceへSDK型を漏らさず最終tokenから注入できる", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ExplanationsModule],
      providers: [
        SessionCounterplanService,
        {
          provide: PrismaService,
          useValue: { battleSession: { findFirst: vi.fn() } },
        },
      ],
    }).compile();

    expect(moduleRef.get(SessionCounterplanService)).toBeInstanceOf(SessionCounterplanService);
    await moduleRef.close();
  });

  it("最終GeneratorとAnthropic clientを個別に差し替えられる", async () => {
    const fakeGenerator: ExplanationGenerator = {
      generateCounterplanExplanation: vi.fn(),
    };
    const fakeClient: AnthropicMessagesClient = {
      createExplanationMessage: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [ExplanationsModule],
    })
      .overrideProvider(EXPLANATION_GENERATOR)
      .useValue(fakeGenerator)
      .overrideProvider(ANTHROPIC_MESSAGES_CLIENT)
      .useValue(fakeClient)
      .compile();

    expect(moduleRef.get(EXPLANATION_GENERATOR)).toBe(fakeGenerator);
    expect(moduleRef.get(ANTHROPIC_MESSAGES_CLIENT)).toBe(fakeClient);
    await moduleRef.close();
  });
});
