import { ConflictException, type INestApplication, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  adminAbilitySchema,
  adminAbilityWriteSchema,
  adminItemSchema,
  adminItemWriteSchema,
  adminMoveSchema,
  adminMoveWriteSchema,
  adminPokemonMovesResponseSchema,
  adminPokemonSchema,
  adminPokemonWriteSchema,
  API_PREFIX,
  problemDetailsSchema,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AdminMasterService } from "../src/modules/admin-master/admin-master.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";

const TEST_ACCESS_SECRET = "master-008-api-access-secret-at-least-32-bytes";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";

const pokemonInput = adminPokemonWriteSchema.parse({
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
  abilities: ["いかく"],
  isMega: false,
  basePokemonId: null,
});
const pokemon = adminPokemonSchema.parse({ id: 1, ...pokemonInput });
const moveInput = adminMoveWriteSchema.parse({
  nameJa: "たきのぼり",
  nameEn: "Waterfall",
  type: "water",
  category: "physical",
  power: 80,
  accuracy: 100,
  priority: 0,
  tags: [],
});
const move = adminMoveSchema.parse({ id: 10, ...moveInput });
const itemInput = adminItemWriteSchema.parse({
  nameJa: "オボンのみ",
  nameEn: "Sitrus Berry",
  effectTags: ["berry"],
});
const item = adminItemSchema.parse({ id: 20, ...itemInput });
const abilityInput = adminAbilityWriteSchema.parse({
  nameJa: "いかく",
  nameEn: "Intimidate",
  effectTags: ["stat_control"],
});
const ability = adminAbilitySchema.parse({ id: 30, ...abilityInput });

describe("MASTER-008 admin master APIs", () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  const previousSecret = process.env.JWT_ACCESS_SECRET;

  const methods = {
    listPokemons: vi.fn(),
    getPokemon: vi.fn(),
    createPokemon: vi.fn(),
    updatePokemon: vi.fn(),
    deletePokemon: vi.fn(),
    listMoves: vi.fn(),
    getMove: vi.fn(),
    createMove: vi.fn(),
    updateMove: vi.fn(),
    deleteMove: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    listAbilities: vi.fn(),
    getAbility: vi.fn(),
    createAbility: vi.fn(),
    updateAbility: vi.fn(),
    deleteAbility: vi.fn(),
    listPokemonMoves: vi.fn(),
    replacePokemonMoves: vi.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(AdminMasterService)
      .useValue(methods)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    const jwt = moduleRef.get(JwtService);
    adminToken = await jwt.signAsync(
      { sub: adminId, role: "admin" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
    userToken = await jwt.signAsync(
      { sub: userId, role: "user" },
      { algorithm: "HS256", secret: TEST_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    methods.listPokemons.mockResolvedValue([pokemon]);
    methods.getPokemon.mockResolvedValue(pokemon);
    methods.createPokemon.mockResolvedValue(pokemon);
    methods.updatePokemon.mockResolvedValue({ ...pokemon, nameJa: "更新ギャラドス" });
    methods.deletePokemon.mockResolvedValue(undefined);
    methods.listMoves.mockResolvedValue([move]);
    methods.getMove.mockResolvedValue(move);
    methods.createMove.mockResolvedValue(move);
    methods.updateMove.mockResolvedValue({ ...move, power: 90 });
    methods.deleteMove.mockResolvedValue(undefined);
    methods.listItems.mockResolvedValue([item]);
    methods.getItem.mockResolvedValue(item);
    methods.createItem.mockResolvedValue(item);
    methods.updateItem.mockResolvedValue({ ...item, nameJa: "更新オボン" });
    methods.deleteItem.mockResolvedValue(undefined);
    methods.listAbilities.mockResolvedValue([ability]);
    methods.getAbility.mockResolvedValue(ability);
    methods.createAbility.mockResolvedValue(ability);
    methods.updateAbility.mockResolvedValue({ ...ability, nameJa: "更新いかく" });
    methods.deleteAbility.mockResolvedValue(undefined);
    methods.listPokemonMoves.mockResolvedValue({ pokemonId: 1, moveIds: [10] });
    methods.replacePokemonMoves.mockResolvedValue({ pokemonId: 1, moveIds: [10, 11] });
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${adminToken}` });

  it("adminがPokemon CRUDとPokemonMove一覧・全置換を利用できる", async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get("/api/v1/admin/master/pokemons")
          .set(auth())
          .expect(200)
      ).body,
    ).toEqual({ items: [pokemon] });
    expect(
      (
        await request(app.getHttpServer())
          .get("/api/v1/admin/master/pokemons/1")
          .set(auth())
          .expect(200)
      ).body,
    ).toEqual(pokemon);
    await request(app.getHttpServer())
      .post("/api/v1/admin/master/pokemons")
      .set(auth())
      .send(pokemonInput)
      .expect(201);
    await request(app.getHttpServer())
      .put("/api/v1/admin/master/pokemons/1")
      .set(auth())
      .send({ ...pokemonInput, nameJa: "更新ギャラドス" })
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/v1/admin/master/pokemons/1/moves")
      .set(auth())
      .expect(200)
      .expect(({ body }) => adminPokemonMovesResponseSchema.parse(body));
    await request(app.getHttpServer())
      .put("/api/v1/admin/master/pokemons/1/moves")
      .set(auth())
      .send({ moveIds: [11, 10] })
      .expect(200);
    await request(app.getHttpServer())
      .delete("/api/v1/admin/master/pokemons/1")
      .set(auth())
      .expect(204);

    expect(methods.createPokemon).toHaveBeenCalledWith(pokemonInput);
    expect(methods.replacePokemonMoves).toHaveBeenCalledWith(1, { moveIds: [11, 10] });
  });

  it.each([
    ["moves", moveInput, move],
    ["items", itemInput, item],
    ["abilities", abilityInput, ability],
  ])("adminが%s CRUDを利用できる", async (resource, input, expected) => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/master/${resource}`)
      .set(auth())
      .expect(200);
    expect(list.body).toEqual({ items: [expected] });
    await request(app.getHttpServer())
      .get(`/api/v1/admin/master/${resource}/${expected.id}`)
      .set(auth())
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/master/${resource}`)
      .set(auth())
      .send(input)
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/admin/master/${resource}/${expected.id}`)
      .set(auth())
      .send(input)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/master/${resource}/${expected.id}`)
      .set(auth())
      .expect(204);
  });

  it("未認証は401、一般userは403で公開master APIの認証方式に影響しない", async () => {
    const unauthorized = await request(app.getHttpServer())
      .get("/api/v1/admin/master/pokemons")
      .expect(401);
    expect(problemDetailsSchema.parse(unauthorized.body)).toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });

    const forbidden = await request(app.getHttpServer())
      .get("/api/v1/admin/master/pokemons")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);
    expect(problemDetailsSchema.parse(forbidden.body)).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });

    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    expect(methods.listPokemons).not.toHaveBeenCalled();
  });

  it("不正ID・余分なrole・重複moveIdsを400にしてserviceを呼ばない", async () => {
    const operations = [
      () => request(app.getHttpServer()).get("/api/v1/admin/master/pokemons/not-an-id").set(auth()),
      () =>
        request(app.getHttpServer())
          .post("/api/v1/admin/master/pokemons")
          .set(auth())
          .send({ ...pokemonInput, role: "admin" }),
      () =>
        request(app.getHttpServer())
          .put("/api/v1/admin/master/pokemons/1/moves")
          .set(auth())
          .send({ moveIds: [10, 10] }),
    ];
    for (const operation of operations) {
      const response = await operation().expect(400);
      expect(problemDetailsSchema.parse(response.body)).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(methods.replacePokemonMoves).not.toHaveBeenCalled();
  });

  it("不存在404と参照競合409をRFC 9457で返し内部情報を公開しない", async () => {
    methods.getMove.mockRejectedValueOnce(
      new NotFoundException({
        type: "about:blank",
        title: "Move Not Found",
        status: 404,
        code: "NOT_FOUND",
      }),
    );
    const missing = await request(app.getHttpServer())
      .get("/api/v1/admin/master/moves/999")
      .set(auth())
      .expect(404);
    expect(problemDetailsSchema.parse(missing.body)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    methods.deleteItem.mockRejectedValueOnce(
      new ConflictException({
        type: "about:blank",
        title: "Master Conflict",
        status: 409,
        code: "MASTER_CONFLICT",
      }),
    );
    const conflict = await request(app.getHttpServer())
      .delete("/api/v1/admin/master/items/20")
      .set(auth())
      .expect(409);
    expect(problemDetailsSchema.parse(conflict.body)).toEqual({
      type: "about:blank",
      title: "Master Conflict",
      status: 409,
      code: "MASTER_CONFLICT",
    });
    expect(JSON.stringify(conflict.body)).not.toContain("P2003");
  });
});
