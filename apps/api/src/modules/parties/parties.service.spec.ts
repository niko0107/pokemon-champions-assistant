import { Prisma } from "@pokemon-champions/database";
import { partyWriteSchema, type PartyWrite } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PartiesService } from "./parties.service";

const now = new Date("2026-07-25T00:00:00.000Z");
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";

const validInput: PartyWrite = partyWriteSchema.parse({
  name: "ランク用",
  description: "シングル用",
  ruleId: 1,
  isActive: true,
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      abilityId: 30,
      nature: "ようき",
      teraType: "みず",
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      moves: [
        { slot: 1, moveId: 40 },
        { slot: 2, moveId: 41 },
        { slot: 3, moveId: 42 },
        { slot: 4, moveId: 43 },
      ],
    },
  ],
});

const detailRecord = {
  id: partyId,
  name: validInput.name,
  description: validInput.description,
  ruleId: validInput.ruleId,
  isActive: validInput.isActive,
  createdAt: now,
  updatedAt: now,
  pokemons: validInput.pokemons,
};

describe("PartiesService", () => {
  const listFindMany = vi.fn();
  const getFindFirst = vi.fn();
  const removeDeleteMany = vi.fn();
  const transactionPartyFindFirst = vi.fn();
  const transactionPartyCreate = vi.fn();
  const transactionPartyUpdate = vi.fn();
  const activeUpdateMany = vi.fn();
  const partyPokemonDeleteMany = vi.fn();
  const ruleFindUnique = vi.fn();
  const pokemonFindMany = vi.fn();
  const itemFindMany = vi.fn();
  const abilityFindMany = vi.fn();
  const moveFindMany = vi.fn();
  const pokemonMoveFindMany = vi.fn();

  const transaction = {
    party: {
      findFirst: transactionPartyFindFirst,
      create: transactionPartyCreate,
      update: transactionPartyUpdate,
      updateMany: activeUpdateMany,
    },
    partyPokemon: { deleteMany: partyPokemonDeleteMany },
    rule: { findUnique: ruleFindUnique },
    pokemon: { findMany: pokemonFindMany },
    item: { findMany: itemFindMany },
    ability: { findMany: abilityFindMany },
    move: { findMany: moveFindMany },
    pokemonMove: { findMany: pokemonMoveFindMany },
  };
  const runTransaction = vi.fn(
    async (
      callback: (client: typeof transaction) => Promise<unknown>,
      _options?: { isolationLevel: string },
    ) => callback(transaction),
  );
  const service = new PartiesService({
    party: {
      findMany: listFindMany,
      findFirst: getFindFirst,
      deleteMany: removeDeleteMany,
    },
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    listFindMany.mockResolvedValue([]);
    getFindFirst.mockResolvedValue(detailRecord);
    removeDeleteMany.mockResolvedValue({ count: 1 });
    transactionPartyFindFirst.mockResolvedValue({ id: partyId });
    transactionPartyCreate.mockResolvedValue(detailRecord);
    transactionPartyUpdate.mockResolvedValue(detailRecord);
    activeUpdateMany.mockResolvedValue({ count: 1 });
    partyPokemonDeleteMany.mockResolvedValue({ count: 1 });
    ruleFindUnique.mockResolvedValue({ id: 1, teamSize: 1 });
    pokemonFindMany.mockResolvedValue([{ id: 10, abilities: ["いかく"] }]);
    itemFindMany.mockResolvedValue([{ id: 20 }]);
    abilityFindMany.mockResolvedValue([{ id: 30, nameJa: "いかく" }]);
    moveFindMany.mockResolvedValue([{ id: 40 }, { id: 41 }, { id: 42 }, { id: 43 }]);
    pokemonMoveFindMany.mockResolvedValue(
      validInput.pokemons[0]?.moves.map((move) => ({
        pokemonId: 10,
        moveId: move.moveId,
      })),
    );
  });

  it("一覧を所有者で絞りactive→更新日時→名称→IDの決定的順序で取得する", async () => {
    listFindMany.mockResolvedValue([
      {
        id: partyId,
        name: validInput.name,
        description: validInput.description,
        ruleId: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await expect(service.list(userId)).resolves.toHaveLength(1);
    expect(listFindMany).toHaveBeenCalledWith({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        ruleId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
    });
  });

  it("単体取得はIDと所有者を同時に条件にし、他人のIDも404にする", async () => {
    await expect(service.get(userId, partyId)).resolves.toMatchObject({ id: partyId });
    expect(getFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: partyId, userId } }),
    );

    getFindFirst.mockResolvedValueOnce(null);
    await expect(service.get(otherUserId, partyId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
    expect(getFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: partyId, userId: otherUserId } }),
    );
  });

  it("マスタ参照を検証し、子要素をnested createする", async () => {
    const result = await service.create(userId, validInput);

    expect(result.id).toBe(partyId);
    expect(transactionPartyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: { connect: { id: userId } },
          rule: { connect: { id: 1 } },
          pokemons: {
            create: [
              expect.objectContaining({
                pokemon: { connect: { id: 10 } },
                item: { connect: { id: 20 } },
                ability: { connect: { id: 30 } },
                moves: {
                  create: [
                    { slot: 1, move: { connect: { id: 40 } } },
                    { slot: 2, move: { connect: { id: 41 } } },
                    { slot: 3, move: { connect: { id: 42 } } },
                    { slot: 4, move: { connect: { id: 43 } } },
                  ],
                },
              }),
            ],
          },
        }),
      }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("active作成時は同じ所有者の既存activeだけを同じtransactionで解除する", async () => {
    await service.create(userId, validInput);

    expect(activeUpdateMany).toHaveBeenCalledWith({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    expect(activeUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      transactionPartyCreate.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("PUTは所有者確認後に子要素を削除・再作成する全置換を行う", async () => {
    await expect(service.update(userId, partyId, validInput)).resolves.toMatchObject({
      id: partyId,
    });

    expect(transactionPartyFindFirst).toHaveBeenCalledWith({
      where: { id: partyId, userId },
      select: { id: true },
    });
    expect(activeUpdateMany).toHaveBeenCalledWith({
      where: { userId, isActive: true, id: { not: partyId } },
      data: { isActive: false },
    });
    expect(partyPokemonDeleteMany).toHaveBeenCalledWith({
      where: { partyId, party: { userId } },
    });
    expect(transactionPartyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: partyId, userId },
        data: expect.objectContaining({
          pokemons: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
  });

  it("他人の更新は404にして子削除・マスタ検証へ進まない", async () => {
    transactionPartyFindFirst.mockResolvedValue(null);

    await expect(service.update(otherUserId, partyId, validInput)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
    expect(partyPokemonDeleteMany).not.toHaveBeenCalled();
    expect(ruleFindUnique).not.toHaveBeenCalled();
    expect(transactionPartyUpdate).not.toHaveBeenCalled();
  });

  it("削除はIDと所有者を条件にした物理削除とし、他人のIDは404にする", async () => {
    await expect(service.remove(userId, partyId)).resolves.toBeUndefined();
    expect(removeDeleteMany).toHaveBeenCalledWith({ where: { id: partyId, userId } });

    removeDeleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove(otherUserId, partyId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
  });

  it("存在しないRule・Pokemon・Item・Ability・Moveを400にして保存しない", async () => {
    ruleFindUnique.mockResolvedValue(null);
    pokemonFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([]);
    abilityFindMany.mockResolvedValue([]);
    moveFindMany.mockResolvedValue([]);
    pokemonMoveFindMany.mockResolvedValue([]);

    await expect(service.create(userId, validInput)).rejects.toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        title: "Invalid Master Reference",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
        errors: expect.arrayContaining([
          expect.objectContaining({ path: "ruleId" }),
          expect.objectContaining({ path: "pokemons.0.pokemonId" }),
          expect.objectContaining({ path: "pokemons.0.itemId" }),
          expect.objectContaining({ path: "pokemons.0.abilityId" }),
          expect.objectContaining({ path: "pokemons.0.moves.0.moveId" }),
        ]),
      },
    });
    expect(transactionPartyCreate).not.toHaveBeenCalled();
    expect(activeUpdateMany).not.toHaveBeenCalled();
  });

  it("習得不能技と所持不能特性を400にして保存しない", async () => {
    pokemonFindMany.mockResolvedValue([{ id: 10, abilities: ["別の特性"] }]);
    pokemonMoveFindMany.mockResolvedValue([]);

    await expect(service.create(userId, validInput)).rejects.toMatchObject({
      status: 400,
      response: {
        code: "INVALID_MASTER_REFERENCE",
        errors: expect.arrayContaining([
          expect.objectContaining({ path: "pokemons.0.abilityId" }),
          expect.objectContaining({ path: "pokemons.0.moves.0.moveId" }),
        ]),
      },
    });
    expect(transactionPartyCreate).not.toHaveBeenCalled();
  });

  it("Rule.teamSizeとの人数不一致とslot範囲違反を400にする", async () => {
    ruleFindUnique.mockResolvedValue({ id: 1, teamSize: 0 });

    await expect(service.create(userId, validInput)).rejects.toMatchObject({
      status: 400,
      response: {
        errors: expect.arrayContaining([
          expect.objectContaining({ path: "pokemons" }),
          expect.objectContaining({ path: "pokemons.0.slot" }),
        ]),
      },
    });
    expect(transactionPartyCreate).not.toHaveBeenCalled();
  });

  it("nested create失敗はtransaction外へ書き込まずロールバック対象にする", async () => {
    transactionPartyCreate.mockRejectedValue(new Error("nested child failed"));

    await expect(service.create(userId, validInput)).rejects.toThrow("nested child failed");
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(transactionPartyCreate).toHaveBeenCalledOnce();
    expect(removeDeleteMany).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2034"])("Prisma %s競合をRFC 9457形式の409へ変換する", async (code) => {
    transactionPartyCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Party conflict", {
        code,
        clientVersion: "6.19.3",
      }),
    );

    await expect(service.create(userId, validInput)).rejects.toMatchObject({
      status: 409,
      response: {
        type: "about:blank",
        title: "Party Conflict",
        status: 409,
        code: "PARTY_CONFLICT",
      },
    });
  });
});
