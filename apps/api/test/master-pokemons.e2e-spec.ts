import { describe, beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  API_PREFIX,
  masterPokemonDetailSchema,
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

const gyaradosDetail = {
  ...gyarados,
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
};

const megaGyaradosDetail = {
  ...megaGyarados,
  baseHp: 95,
  baseAtk: 155,
  baseDef: 109,
  baseSpa: 70,
  baseSpd: 130,
  baseSpe: 81,
};

describe("GET /api/v1/master/pokemons", () => {
  let app: INestApplication;
  const findMany = vi.fn();
  const findUnique = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        pokemon: { findMany, findUnique },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    findMany.mockResolvedValue([]);
    findUnique.mockResolvedValue(null);
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

  it("通常ポケモンの詳細と6種族値を認証なしで返す", async () => {
    findUnique.mockResolvedValue(gyaradosDetail);

    const res = await request(app.getHttpServer()).get("/api/v1/master/pokemons/1").expect(200);

    expect(res.body).toEqual(gyaradosDetail);
    expect(masterPokemonDetailSchema.safeParse(res.body).success).toBe(true);
  });

  it("メガ形態の詳細を返す", async () => {
    findUnique.mockResolvedValue(megaGyaradosDetail);

    const res = await request(app.getHttpServer()).get("/api/v1/master/pokemons/4").expect(200);

    expect(res.body).toEqual(megaGyaradosDetail);
  });

  it("存在しないIDは404 NOT_FOUNDを返す", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/master/pokemons/9999").expect(404);

    expect(problemDetailsSchema.parse(res.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it.each(["0", "-1", "1.5", "abc", "2147483648", "9007199254740992"])(
    "不正なID %s は400 VALIDATION_ERRORを返す",
    async (id) => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/master/pokemons/${id}`)
        .expect(400);

      expect(problemDetailsSchema.parse(res.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it("不正なPokemon詳細DB値は内部情報なしの500を返す", async () => {
    findUnique.mockResolvedValue({ ...gyaradosDetail, baseHp: 0 });

    const res = await request(app.getHttpServer()).get("/api/v1/master/pokemons/1").expect(500);

    expect(res.body).toEqual({
      type: "about:blank",
      title: "Master Data Integrity Error",
      status: 500,
      code: "INTERNAL_ERROR",
    });
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
