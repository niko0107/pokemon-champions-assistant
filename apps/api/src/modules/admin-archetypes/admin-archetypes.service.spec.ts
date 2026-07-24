import { Prisma } from "@pokemon-champions/database";
import { adminArchetypeWriteSchema, type AdminArchetypeWrite } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminArchetypesService } from "./admin-archetypes.service";

const now = new Date("2026-07-25T00:00:00.000Z");
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const validInput: AdminArchetypeWrite = adminArchetypeWriteSchema.parse({
  name: "展開構築",
  description: "起点を作る",
  seasonId: 1,
  ruleId: 1,
  defaultLeads: [1],
  playstyleNotes: "先発から展開する",
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      itemAlternatives: [21],
      abilityId: 30,
      role: "lead",
      moves: [{ moveId: 40 }],
    },
  ],
  sources: [
    {
      title: "構築記事",
      url: "https://example.com/archetype",
      siteName: "Example",
    },
  ],
});

const detailRecord = {
  id: archetypeId,
  name: validInput.name,
  description: validInput.description,
  seasonId: validInput.seasonId,
  ruleId: validInput.ruleId,
  popularityTier: "mid",
  popularityScore: null,
  encounterCount: 0,
  pickCount: 0,
  defaultLeads: validInput.defaultLeads,
  playstyleNotes: validInput.playstyleNotes,
  status: validInput.status,
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
  pokemons: [
    {
      ...validInput.pokemons[0],
      itemAlternatives: validInput.pokemons[0]?.itemAlternatives ?? [],
      evs: null,
      usageRate: new Prisma.Decimal(1),
      moves: [{ moveId: 40, adoptionRate: new Prisma.Decimal(1) }],
    },
  ],
  sources: validInput.sources,
};

describe("AdminArchetypesService", () => {
  const listFindMany = vi.fn();
  const getFindUnique = vi.fn();
  const archiveUpdateMany = vi.fn();
  const transactionArchetypeFindUnique = vi.fn();
  const transactionArchetypeCreate = vi.fn();
  const transactionArchetypeUpdate = vi.fn();
  const sourceDeleteMany = vi.fn();
  const pokemonDeleteMany = vi.fn();
  const seasonFindUnique = vi.fn();
  const ruleFindUnique = vi.fn();
  const pokemonFindMany = vi.fn();
  const itemFindMany = vi.fn();
  const abilityFindMany = vi.fn();
  const moveFindMany = vi.fn();
  const pokemonMoveFindMany = vi.fn();

  const transaction = {
    archetype: {
      findUnique: transactionArchetypeFindUnique,
      create: transactionArchetypeCreate,
      update: transactionArchetypeUpdate,
    },
    archetypeSource: { deleteMany: sourceDeleteMany },
    archetypePokemon: { deleteMany: pokemonDeleteMany },
    season: { findUnique: seasonFindUnique },
    rule: { findUnique: ruleFindUnique },
    pokemon: { findMany: pokemonFindMany },
    item: { findMany: itemFindMany },
    ability: { findMany: abilityFindMany },
    move: { findMany: moveFindMany },
    pokemonMove: { findMany: pokemonMoveFindMany },
  };
  const runTransaction = vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  const service = new AdminArchetypesService({
    archetype: {
      findMany: listFindMany,
      findUnique: getFindUnique,
      updateMany: archiveUpdateMany,
    },
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    listFindMany.mockResolvedValue([]);
    getFindUnique.mockResolvedValue(detailRecord);
    archiveUpdateMany.mockResolvedValue({ count: 1 });
    transactionArchetypeFindUnique.mockResolvedValue({ id: archetypeId });
    transactionArchetypeCreate.mockResolvedValue(detailRecord);
    transactionArchetypeUpdate.mockResolvedValue(detailRecord);
    sourceDeleteMany.mockResolvedValue({ count: 1 });
    pokemonDeleteMany.mockResolvedValue({ count: 1 });
    seasonFindUnique.mockResolvedValue({ id: 1 });
    ruleFindUnique.mockResolvedValue({ id: 1, teamSize: 1, pickSize: 1 });
    pokemonFindMany.mockResolvedValue([{ id: 10, abilities: ["いかく"] }]);
    itemFindMany.mockResolvedValue([{ id: 20 }, { id: 21 }]);
    abilityFindMany.mockResolvedValue([{ id: 30, nameJa: "いかく" }]);
    moveFindMany.mockResolvedValue([{ id: 40 }]);
    pokemonMoveFindMany.mockResolvedValue([{ pokemonId: 10, moveId: 40 }]);
  });

  it("一覧を更新日時→名称→IDの決定的順序と必要列だけで取得する", async () => {
    listFindMany.mockResolvedValue([
      {
        id: archetypeId,
        name: validInput.name,
        description: validInput.description,
        seasonId: 1,
        ruleId: 1,
        popularityTier: "mid",
        status: "published",
        publishedAt: now,
        updatedAt: now,
      },
    ]);

    await expect(service.list()).resolves.toHaveLength(1);
    expect(listFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        description: true,
        seasonId: true,
        ruleId: true,
        popularityTier: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
    });
  });

  it("全マスタ参照を検証して子要素をnested createする", async () => {
    const result = await service.create(validInput);

    expect(result.id).toBe(archetypeId);
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(transactionArchetypeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          season: { connect: { id: 1 } },
          rule: { connect: { id: 1 } },
          pokemons: {
            create: [
              expect.objectContaining({
                pokemon: { connect: { id: 10 } },
                item: { connect: { id: 20 } },
                ability: { connect: { id: 30 } },
                moves: {
                  create: [{ move: { connect: { id: 40 } }, adoptionRate: 1 }],
                },
              }),
            ],
          },
        }),
      }),
    );
  });

  it("存在しないマスタ・習得不能技・所持不能特性を400にして保存しない", async () => {
    seasonFindUnique.mockResolvedValue(null);
    pokemonFindMany.mockResolvedValue([{ id: 10, abilities: ["別の特性"] }]);
    itemFindMany.mockResolvedValue([{ id: 20 }]);
    moveFindMany.mockResolvedValue([{ id: 40 }]);
    pokemonMoveFindMany.mockResolvedValue([]);

    const error = await service.create(validInput).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
      },
    });
    expect(transactionArchetypeCreate).not.toHaveBeenCalled();
  });

  it("RuleのteamSize・pickSizeと構築内容の不一致を400にする", async () => {
    ruleFindUnique.mockResolvedValue({ id: 1, teamSize: 2, pickSize: 2 });

    await expect(service.create(validInput)).rejects.toMatchObject({
      status: 400,
      response: {
        errors: expect.arrayContaining([
          expect.objectContaining({ path: "pokemons" }),
          expect.objectContaining({ path: "defaultLeads" }),
        ]),
      },
    });
    expect(transactionArchetypeCreate).not.toHaveBeenCalled();
  });

  it("PUTは子要素を削除・再作成する全置換を1トランザクションで行う", async () => {
    await expect(service.update(archetypeId, validInput)).resolves.toMatchObject({
      id: archetypeId,
    });

    expect(sourceDeleteMany).toHaveBeenCalledWith({ where: { archetypeId } });
    expect(pokemonDeleteMany).toHaveBeenCalledWith({ where: { archetypeId } });
    expect(transactionArchetypeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: archetypeId },
        data: expect.objectContaining({
          pokemons: expect.objectContaining({ create: expect.any(Array) }),
          sources: { create: validInput.sources },
        }),
      }),
    );
    expect(runTransaction).toHaveBeenCalledOnce();
  });

  it("nested create失敗をそのままロールバック対象にし、トランザクション外へ書き込まない", async () => {
    transactionArchetypeCreate.mockRejectedValue(new Error("nested child failed"));

    await expect(service.create(validInput)).rejects.toThrow("nested child failed");
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(transactionArchetypeCreate).toHaveBeenCalledOnce();
    expect(sourceDeleteMany).not.toHaveBeenCalled();
    expect(pokemonDeleteMany).not.toHaveBeenCalled();
  });

  it("Prisma一意制約競合をRFC 9457形式の409へ変換する", async () => {
    transactionArchetypeCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );

    await expect(service.create(validInput)).rejects.toMatchObject({
      status: 409,
      response: {
        type: "about:blank",
        title: "Archetype Conflict",
        status: 409,
        code: "ARCHETYPE_CONFLICT",
      },
    });
  });

  it("存在しないIDの取得・更新・削除を404にする", async () => {
    getFindUnique.mockResolvedValue(null);
    await expect(service.get(archetypeId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });

    transactionArchetypeFindUnique.mockResolvedValue(null);
    await expect(service.update(archetypeId, validInput)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });

    archiveUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.archive(archetypeId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
  });
});
