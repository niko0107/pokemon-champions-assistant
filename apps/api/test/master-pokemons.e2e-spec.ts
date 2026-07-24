import { describe, beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  API_PREFIX,
  pokemonSearchResponseSchema,
  problemDetailsSchema,
} from "@pokemon-champions/shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const gyarados = {
  id: 1,
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};

const megaGyarados = {
  id: 4,
  dexNo: 130,
  nameJa: "メガギャラドス",
  nameEn: "Mega Gyarados",
  form: "mega",
  type1: "water",
  type2: "dark",
  isMega: true,
  basePokemonId: 1,
};

describe("GET /api/v1/master/pokemons", () => {
  let app: INestApplication;
  const findMany = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        pokemon: { findMany },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("q に一致するポケモンを items として返す", async () => {
    findMany.mockResolvedValueOnce([gyarados]).mockResolvedValueOnce([megaGyarados]);

    const res = await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ギャラ" })
      .expect(200);

    expect(res.body).toEqual({ items: [gyarados, megaGyarados] });
    // 共有スキーマでも検証(フロントと同じ契約)
    expect(pokemonSearchResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("q の前後空白を除去して検索する", async () => {
    findMany.mockResolvedValueOnce([gyarados]).mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "  Gyara  " })
      .expect(200);

    expect(findMany.mock.calls[0]?.[0].where.OR[0]).toEqual({ nameJa: { startsWith: "Gyara" } });
  });

  it("一致なしの場合は空配列を返す", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query({ q: "ミュウツー" })
      .expect(200);

    expect(res.body).toEqual({ items: [] });
  });

  it.each([
    ["q 未指定", {}],
    ["q が空文字", { q: "" }],
    ["q が空白のみ", { q: "   " }],
    ["q が1文字", { q: "ギ" }],
    ["q が51文字", { q: "あ".repeat(51) }],
  ])("%s は 400 (RFC 9457 / VALIDATION_ERROR) を返す", async (_label, query) => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/master/pokemons")
      .query(query)
      .expect(400);

    const problem = problemDetailsSchema.parse(res.body);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("VALIDATION_ERROR");
    expect(problem.errors?.length).toBeGreaterThan(0);
    // 検証エラー時は DB へ問い合わせない
    expect(findMany).not.toHaveBeenCalled();
  });

  it("既存の GET /api/v1/health に影響しない", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
