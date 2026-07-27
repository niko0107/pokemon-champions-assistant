import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCounterplanService } from "../sessions/session-counterplan.service";
import { EXPLANATION_GENERATOR, type ExplanationGenerator } from "./explanation-generator";
import { ExplanationsModule } from "./explanations.module";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

describe("ExplanationsModule DI", () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey;
    }
  });

  it.each([undefined, "", "   "])(
    "ANTHROPIC_API_KEY=%sでもTemplate実装を解決する",
    async (apiKey) => {
      if (apiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = apiKey;
      }
      const moduleRef = await Test.createTestingModule({
        imports: [ExplanationsModule],
      }).compile();

      expect(moduleRef.get<ExplanationGenerator>(EXPLANATION_GENERATOR)).toBeInstanceOf(
        TemplateExplanationGenerator,
      );
      await moduleRef.close();
    },
  );

  it("SessionCounterplanServiceへtokenから注入できる", async () => {
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

  it("テスト用Generatorへ差し替えられる", async () => {
    const fake: ExplanationGenerator = {
      generateCounterplanExplanation: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [ExplanationsModule],
    })
      .overrideProvider(EXPLANATION_GENERATOR)
      .useValue(fake)
      .compile();

    expect(moduleRef.get(EXPLANATION_GENERATOR)).toBe(fake);
    await moduleRef.close();
  });
});
