import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  abilitySearchResponseSchema,
  API_PREFIX,
  itemSearchResponseSchema,
  moveSearchResponseSchema,
  problemDetailsSchema,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const waterfall = {
  id: 1,
  nameJa: "たきのぼり",
  nameEn: "Waterfall",
  type: "water",
  category: "physical",
  power: 80,
  accuracy: 100,
  priority: 0,
  tags: [],
};

const muddyWater = {
  ...waterfall,
  id: 2,
  nameJa: "だくりゅう",
  nameEn: "Muddy Water",
  category: "special",
  power: 90,
  accuracy: 85,
};

const choiceScarf = {
  id: 1,
  nameJa: "こだわりスカーフ",
  nameEn: "Choice Scarf",
  effectTags: ["choice", "speed_boost"],
};

const intimidate = {
  id: 1,
  nameJa: "いかく",
  nameEn: "Intimidate",
  effectTags: ["stat_control"],
};

describe("MASTER-007 catalog search APIs", () => {
  let app: INestApplication;
  const pokemonFindMany = vi.fn();
  const pokemonFindUnique = vi.fn();
  const moveFindMany = vi.fn();
  const itemFindMany = vi.fn();
  const abilityFindMany = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
        pokemon: {
          findMany: pokemonFindMany,
          findUnique: pokemonFindUnique,
        },
        move: { findMany: moveFindMany },
        item: { findMany: itemFindMany },
        ability: { findMany: abilityFindMany },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  beforeEach(() => {
    pokemonFindMany.mockReset();
    pokemonFindUnique.mockReset();
    moveFindMany.mockReset();
    itemFindMany.mockReset();
    abilityFindMany.mockReset();
    pokemonFindMany.mockResolvedValue([]);
    pokemonFindUnique.mockResolvedValue(null);
    moveFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([]);
    abilityFindMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("技をqのみで前方一致→部分一致の順に返す", async () => {
    moveFindMany.mockResolvedValueOnce([waterfall]).mockResolvedValueOnce([muddyWater]);

    const res = await request(app.getHttpServer())
      .get("/api/v1/master/moves")
      .query({ q: "  water  " })
      .expect(200);

    expect(res.body).toEqual({ items: [waterfall, muddyWater] });
    expect(moveSearchResponseSchema.safeParse(res.body).success).toBe(true);
    expect(moveFindMany.mock.calls[0]?.[0].where.OR[1]).toEqual({
      nameEn: { startsWith: "water", mode: "insensitive" },
    });
  });

  it("技をpokemon_idのみで習得可能技に絞る", async () => {
    moveFindMany.mockResolvedValue([waterfall]);

    const res = await request(app.getHttpServer())
      .get("/api/v1/master/moves")
      .query({ pokemon_id: "1" })
      .expect(200);

    expect(res.body).toEqual({ items: [waterfall] });
    expect(moveFindMany.mock.calls[0]?.[0].where).toEqual({
      learnedBy: { some: { pokemonId: 1 } },
    });
  });

  it("技のqとpokemon_idを同時に適用する", async () => {
    moveFindMany.mockResolvedValueOnce([waterfall]).mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get("/api/v1/master/moves")
      .query({ q: "たき", pokemon_id: "1" })
      .expect(200);

    expect(moveFindMany.mock.calls[0]?.[0].where.AND[0]).toEqual({
      learnedBy: { some: { pokemonId: 1 } },
    });
  });

  it("存在しないpokemon_idの技検索は空配列を返す", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/master/moves")
      .query({ pokemon_id: "9999" })
      .expect(200);

    expect(res.body).toEqual({ items: [] });
  });

  it("持ち物を前方一致優先で検索する", async () => {
    itemFindMany.mockResolvedValueOnce([choiceScarf]).mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .get("/api/v1/master/items")
      .query({ q: "  choice  " })
      .expect(200);

    expect(res.body).toEqual({ items: [choiceScarf] });
    expect(itemSearchResponseSchema.safeParse(res.body).success).toBe(true);
    expect(itemFindMany.mock.calls[0]?.[0].where.OR[1]).toEqual({
      nameEn: { startsWith: "choice", mode: "insensitive" },
    });
  });

  it("持ち物が0件の場合は空配列を返す", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/master/items")
      .query({ q: "存在しない" })
      .expect(200);

    expect(res.body).toEqual({ items: [] });
  });

  it("Pokemon.abilitiesに対応する特性だけを返す", async () => {
    pokemonFindUnique.mockResolvedValue({ abilities: ["いかく"] });
    abilityFindMany.mockResolvedValue([intimidate]);

    const res = await request(app.getHttpServer())
      .get("/api/v1/master/abilities")
      .query({ pokemon_id: "1" })
      .expect(200);

    expect(res.body).toEqual({ items: [intimidate] });
    expect(abilitySearchResponseSchema.safeParse(res.body).success).toBe(true);
    expect(abilityFindMany.mock.calls[0]?.[0].where).toEqual({
      nameJa: { in: ["いかく"] },
    });
  });

  it("存在しないpokemon_idの特性検索は空配列を返す", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/master/abilities")
      .query({ pokemon_id: "9999" })
      .expect(200);

    expect(res.body).toEqual({ items: [] });
    expect(abilityFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["技: 条件未指定", "/api/v1/master/moves", {}],
    ["技: qが1文字", "/api/v1/master/moves", { q: "a" }],
    ["技: pokemon_idが0", "/api/v1/master/moves", { pokemon_id: "0" }],
    ["技: pokemon_idが小数", "/api/v1/master/moves", { pokemon_id: "1.5" }],
    ["持ち物: q未指定", "/api/v1/master/items", {}],
    ["持ち物: qが空白", "/api/v1/master/items", { q: "   " }],
    ["特性: pokemon_id未指定", "/api/v1/master/abilities", {}],
    ["特性: pokemon_idが文字列", "/api/v1/master/abilities", { pokemon_id: "abc" }],
  ])("%sは400 (RFC 9457 / VALIDATION_ERROR)を返す", async (_label, path, query) => {
    const res = await request(app.getHttpServer()).get(path).query(query).expect(400);

    const problem = problemDetailsSchema.parse(res.body);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("VALIDATION_ERROR");
    expect(problem.errors?.length).toBeGreaterThan(0);
    expect(moveFindMany).not.toHaveBeenCalled();
    expect(itemFindMany).not.toHaveBeenCalled();
    expect(pokemonFindUnique).not.toHaveBeenCalled();
    expect(abilityFindMany).not.toHaveBeenCalled();
  });
});
