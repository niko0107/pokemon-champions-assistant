import { Prisma } from "@pokemon-champions/database";
import {
  adminAbilityWriteSchema,
  adminItemWriteSchema,
  adminMoveWriteSchema,
  adminPokemonWriteSchema,
} from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminMasterService } from "./admin-master.service";

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
const pokemonRecord = { id: 1, ...pokemonInput };
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
const moveRecord = { id: 10, ...moveInput };
const itemInput = adminItemWriteSchema.parse({
  nameJa: "オボンのみ",
  nameEn: "Sitrus Berry",
  effectTags: ["berry"],
});
const itemRecord = { id: 20, ...itemInput };
const abilityInput = adminAbilityWriteSchema.parse({
  nameJa: "いかく",
  nameEn: "Intimidate",
  effectTags: ["stat_control"],
});
const abilityRecord = { id: 30, ...abilityInput };

describe("AdminMasterService", () => {
  const pokemonFindMany = vi.fn();
  const pokemonFindUnique = vi.fn();
  const pokemonFindFirst = vi.fn();
  const pokemonCreate = vi.fn();
  const pokemonUpdate = vi.fn();
  const pokemonDelete = vi.fn();
  const moveFindMany = vi.fn();
  const moveFindUnique = vi.fn();
  const moveCreate = vi.fn();
  const moveUpdate = vi.fn();
  const moveDelete = vi.fn();
  const itemFindMany = vi.fn();
  const itemFindUnique = vi.fn();
  const itemCreate = vi.fn();
  const itemUpdate = vi.fn();
  const itemDelete = vi.fn();
  const abilityFindMany = vi.fn();
  const abilityFindUnique = vi.fn();
  const abilityCreate = vi.fn();
  const abilityUpdate = vi.fn();
  const abilityDelete = vi.fn();
  const pokemonMoveFindMany = vi.fn();
  const pokemonMoveDeleteMany = vi.fn();
  const pokemonMoveCreateMany = vi.fn();
  const partyPokemonMoveCount = vi.fn();
  const archetypePokemonMoveCount = vi.fn();
  const partyPokemonCount = vi.fn();
  const archetypePokemonCount = vi.fn();
  const observationCount = vi.fn();

  const transaction = {
    pokemon: {
      findMany: pokemonFindMany,
      findUnique: pokemonFindUnique,
      update: pokemonUpdate,
      create: pokemonCreate,
    },
    move: { findMany: moveFindMany },
    ability: { findMany: abilityFindMany, findUnique: abilityFindUnique, update: abilityUpdate },
    pokemonMove: {
      findMany: pokemonMoveFindMany,
      deleteMany: pokemonMoveDeleteMany,
      createMany: pokemonMoveCreateMany,
    },
    partyPokemon: { count: partyPokemonCount },
    archetypePokemon: { count: archetypePokemonCount },
    partyPokemonMove: { count: partyPokemonMoveCount },
    archetypePokemonMove: { count: archetypePokemonMoveCount },
    observation: { count: observationCount },
  };
  const runTransaction = vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  const service = new AdminMasterService({
    pokemon: {
      findMany: pokemonFindMany,
      findUnique: pokemonFindUnique,
      findFirst: pokemonFindFirst,
      create: pokemonCreate,
      update: pokemonUpdate,
      delete: pokemonDelete,
    },
    move: {
      findMany: moveFindMany,
      findUnique: moveFindUnique,
      create: moveCreate,
      update: moveUpdate,
      delete: moveDelete,
    },
    item: {
      findMany: itemFindMany,
      findUnique: itemFindUnique,
      create: itemCreate,
      update: itemUpdate,
      delete: itemDelete,
    },
    ability: {
      findMany: abilityFindMany,
      findUnique: abilityFindUnique,
      create: abilityCreate,
      update: abilityUpdate,
      delete: abilityDelete,
    },
    pokemonMove: { findMany: pokemonMoveFindMany },
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    pokemonFindMany.mockResolvedValue([]);
    pokemonFindUnique.mockResolvedValue({ id: 1 });
    pokemonFindFirst.mockResolvedValue(null);
    pokemonCreate.mockResolvedValue(pokemonRecord);
    pokemonUpdate.mockResolvedValue(pokemonRecord);
    pokemonDelete.mockResolvedValue(pokemonRecord);
    moveFindMany.mockResolvedValue([]);
    moveFindUnique.mockResolvedValue({ id: 10 });
    moveCreate.mockResolvedValue(moveRecord);
    moveUpdate.mockResolvedValue(moveRecord);
    moveDelete.mockResolvedValue(moveRecord);
    itemFindMany.mockResolvedValue([]);
    itemFindUnique.mockResolvedValue({ id: 20 });
    itemCreate.mockResolvedValue(itemRecord);
    itemUpdate.mockResolvedValue(itemRecord);
    itemDelete.mockResolvedValue(itemRecord);
    abilityFindMany.mockResolvedValue([{ nameJa: "いかく" }]);
    abilityFindUnique.mockResolvedValue({ id: 30, nameJa: "いかく" });
    abilityCreate.mockResolvedValue(abilityRecord);
    abilityUpdate.mockResolvedValue(abilityRecord);
    abilityDelete.mockResolvedValue(abilityRecord);
    pokemonMoveFindMany.mockResolvedValue([]);
    pokemonMoveDeleteMany.mockResolvedValue({ count: 0 });
    pokemonMoveCreateMany.mockResolvedValue({ count: 0 });
    partyPokemonMoveCount.mockResolvedValue(0);
    archetypePokemonMoveCount.mockResolvedValue(0);
    partyPokemonCount.mockResolvedValue(0);
    archetypePokemonCount.mockResolvedValue(0);
    observationCount.mockResolvedValue(0);
  });

  it("4マスタ一覧を決定的なorderByと必要selectだけで取得する", async () => {
    pokemonFindMany.mockResolvedValueOnce([pokemonRecord]);
    moveFindMany.mockResolvedValueOnce([moveRecord]);
    itemFindMany.mockResolvedValueOnce([itemRecord]);
    abilityFindMany.mockResolvedValueOnce([abilityRecord]);

    await expect(service.listPokemons()).resolves.toEqual([pokemonRecord]);
    await expect(service.listMoves()).resolves.toEqual([moveRecord]);
    await expect(service.listItems()).resolves.toEqual([itemRecord]);
    await expect(service.listAbilities()).resolves.toEqual([abilityRecord]);

    expect(pokemonFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ dexNo: "asc" }, { form: "asc" }, { id: "asc" }],
      }),
    );
    expect(moveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ nameJa: "asc" }, { id: "asc" }] }),
    );
  });

  it("Pokemon作成を参照検証と同じtransactionで行う", async () => {
    await expect(service.createPokemon(pokemonInput)).resolves.toEqual(pokemonRecord);
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(abilityFindMany).toHaveBeenCalledWith({
      where: { nameJa: { in: ["いかく"] } },
      select: { nameJa: true },
    });
    expect(pokemonCreate).toHaveBeenCalledWith(expect.objectContaining({ data: pokemonInput }));
  });

  it("Pokemonの存在しないAbilityと自己参照を400にする", async () => {
    abilityFindMany.mockResolvedValueOnce([]);
    await expect(service.createPokemon(pokemonInput)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_MASTER_REFERENCE" },
    });
    expect(pokemonCreate).not.toHaveBeenCalled();

    abilityFindMany.mockResolvedValueOnce([{ nameJa: "いかく" }]);
    await expect(
      service.updatePokemon(1, { ...pokemonInput, basePokemonId: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_MASTER_REFERENCE" },
    });
  });

  it("メガPokemonの元がメガ形態なら400にする", async () => {
    pokemonFindMany.mockResolvedValueOnce([{ id: 2, basePokemonId: null, isMega: true }]);
    await expect(
      service.createPokemon({
        ...pokemonInput,
        dexNo: 131,
        isMega: true,
        basePokemonId: 2,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_MASTER_REFERENCE" },
    });
  });

  it("既存Partyで使用中のPokemon Abilityを除去する更新は409にする", async () => {
    pokemonFindUnique
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ abilities: ["いかく", "じしんかじょう"] });
    abilityFindMany
      .mockResolvedValueOnce([{ nameJa: "いかく" }])
      .mockResolvedValueOnce([{ id: 31 }]);
    partyPokemonCount.mockResolvedValueOnce(1);

    await expect(
      service.updatePokemon(1, {
        ...pokemonInput,
        abilities: ["いかく"],
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "MASTER_CONFLICT" },
    });
    expect(pokemonUpdate).not.toHaveBeenCalled();
  });

  it("Move・Item・Abilityを作成しstrictレスポンスへ射影する", async () => {
    await expect(service.createMove(moveInput)).resolves.toEqual(moveRecord);
    await expect(service.createItem(itemInput)).resolves.toEqual(itemRecord);
    await expect(service.createAbility(abilityInput)).resolves.toEqual(abilityRecord);
  });

  it("Ability日本語名の更新をPokemon.abilitiesと同一transactionで同期する", async () => {
    abilityFindUnique.mockResolvedValueOnce({ id: 30, nameJa: "いかく" });
    pokemonFindMany.mockResolvedValueOnce([{ id: 1, abilities: ["いかく"] }]);
    abilityUpdate.mockResolvedValueOnce({ ...abilityRecord, nameJa: "威嚇" });

    await expect(
      service.updateAbility(30, { ...abilityInput, nameJa: "威嚇" }),
    ).resolves.toMatchObject({ nameJa: "威嚇" });
    expect(pokemonUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { abilities: ["威嚇"] },
    });
  });

  it("Pokemonから参照中のAbility削除を409にする", async () => {
    pokemonFindFirst.mockResolvedValueOnce({ id: 1 });
    await expect(service.deleteAbility(30)).rejects.toMatchObject({
      status: 409,
      response: { code: "MASTER_CONFLICT" },
    });
    expect(abilityDelete).not.toHaveBeenCalled();
  });

  it("DBのUNIQUEとFK競合を安全な409へ変換する", async () => {
    moveCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("secret detail", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    await expect(service.createMove(moveInput)).rejects.toMatchObject({
      status: 409,
      response: { code: "MASTER_CONFLICT" },
    });

    itemDelete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("secret detail", {
        code: "P2003",
        clientVersion: "6.19.3",
      }),
    );
    await expect(service.deleteItem(20)).rejects.toMatchObject({
      status: 409,
      response: { code: "MASTER_CONFLICT" },
    });
  });

  it("PokemonMoveを検証後に全置換しID昇順で返す", async () => {
    moveFindMany.mockResolvedValueOnce([{ id: 11 }, { id: 10 }]);
    pokemonMoveFindMany.mockResolvedValueOnce([{ moveId: 9 }]);

    await expect(service.replacePokemonMoves(1, { moveIds: [11, 10] })).resolves.toEqual({
      pokemonId: 1,
      moveIds: [10, 11],
    });
    expect(pokemonMoveDeleteMany).toHaveBeenCalledWith({ where: { pokemonId: 1 } });
    expect(pokemonMoveCreateMany).toHaveBeenCalledWith({
      data: [
        { pokemonId: 1, moveId: 11 },
        { pokemonId: 1, moveId: 10 },
      ],
    });
  });

  it("PokemonMoveに不存在Moveがあれば削除せずtransactionを失敗させる", async () => {
    moveFindMany.mockResolvedValueOnce([{ id: 10 }]);
    await expect(service.replacePokemonMoves(1, { moveIds: [10, 11] })).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_MASTER_REFERENCE" },
    });
    expect(pokemonMoveDeleteMany).not.toHaveBeenCalled();
  });

  it("Party・Archetype・Observationで使用中のPokemonMove削除を409にする", async () => {
    moveFindMany.mockResolvedValueOnce([{ id: 10 }]);
    pokemonMoveFindMany.mockResolvedValueOnce([{ moveId: 9 }, { moveId: 10 }]);
    partyPokemonMoveCount.mockResolvedValueOnce(1);

    await expect(service.replacePokemonMoves(1, { moveIds: [10] })).rejects.toMatchObject({
      status: 409,
      response: { code: "MASTER_CONFLICT" },
    });
    expect(pokemonMoveDeleteMany).not.toHaveBeenCalled();
  });
});
