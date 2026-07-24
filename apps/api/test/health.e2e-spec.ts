import { describe, beforeAll, afterAll, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { API_PREFIX, healthResponseSchema } from "@pokemon-champions/shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";

describe("GET /api/v1/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 で { "status": "ok" } を返す', async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
    // 共有スキーマでも検証(フロントと同じ契約)
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("プレフィックスなしの /health は 404", async () => {
    await request(app.getHttpServer()).get("/health").expect(404);
  });
});
