import { Prisma } from "@pokemon-champions/database";
import { battleSessionCreateSchema, type BattleSessionCreate } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

const now = new Date("2026-07-26T00:00:00.000Z");
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";

const input: BattleSessionCreate = battleSessionCreateSchema.parse({
  partyId,
  ruleId: 1,
});

const partyRecord = {
  id: partyId,
  name: "ランク用",
  description: "シングル用",
  ruleId: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
  rule: { id: 1, teamSize: 1 },
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      abilityId: 30,
      nature: "ようき",
      teraType: "みず",
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      ivs: null,
      actualStats: null,
      pokemon: {
        abilities: ["いかく"],
        learnableMoves: [{ moveId: 40 }, { moveId: 41 }, { moveId: 42 }, { moveId: 43 }],
      },
      ability: { nameJa: "いかく" },
      moves: [
        { slot: 1, moveId: 40 },
        { slot: 2, moveId: 41 },
        { slot: 3, moveId: 42 },
        { slot: 4, moveId: 43 },
      ],
    },
  ],
};

const sessionRecord = {
  id: sessionId,
  partyId,
  ruleId: 1,
  status: "active",
  startedAt: now,
  endedAt: null,
  createdAt: now,
  updatedAt: now,
};
const partyPokemon = partyRecord.pokemons[0]!;

describe("SessionsService", () => {
  const partyFindFirst = vi.fn();
  const sessionCreate = vi.fn();
  const sessionFindFirst = vi.fn();
  const transaction = {
    party: { findFirst: partyFindFirst },
    battleSession: { create: sessionCreate },
  };
  const runTransaction = vi.fn(
    async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
  );
  const service = new SessionsService({
    battleSession: { findFirst: sessionFindFirst },
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    partyFindFirst.mockResolvedValue(partyRecord);
    sessionCreate.mockResolvedValue(sessionRecord);
    sessionFindFirst.mockResolvedValue(sessionRecord);
  });

  it("自分のactiveなPartyを所有者込みで検索し、同じRuleでセッションを作成する", async () => {
    await expect(service.create(userId, input)).resolves.toEqual({
      id: sessionId,
      partyId,
      ruleId: 1,
      status: "active",
      startedAt: now.toISOString(),
      endedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(partyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: partyId, userId } }),
    );
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          user: { connect: { id: userId } },
          party: { connect: { id: partyId } },
          rule: { connect: { id: 1 } },
          status: "active",
        },
      }),
    );
    expect(runTransaction).toHaveBeenCalledOnce();
  });

  it("他人または存在しないPartyは同じ404にして作成しない", async () => {
    partyFindFirst.mockResolvedValue(null);

    for (const callerId of [otherUserId, userId]) {
      await expect(service.create(callerId, input)).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive", { ...partyRecord, isActive: false }, input],
    ["Rule不一致", partyRecord, { ...input, ruleId: 2 }],
    ["teamSize不一致", { ...partyRecord, rule: { id: 1, teamSize: 2 } }, input],
    [
      "技数不正",
      {
        ...partyRecord,
        pokemons: [{ ...partyPokemon, moves: partyPokemon.moves.slice(0, 3) }],
      },
      input,
    ],
    [
      "習得不能技",
      {
        ...partyRecord,
        pokemons: [
          {
            ...partyPokemon,
            pokemon: { ...partyPokemon.pokemon, learnableMoves: [] },
          },
        ],
      },
      input,
    ],
    [
      "所持不能特性",
      {
        ...partyRecord,
        pokemons: [
          {
            ...partyPokemon,
            pokemon: { ...partyPokemon.pokemon, abilities: ["別の特性"] },
          },
        ],
      },
      input,
    ],
  ])("%sのPartyを400 INVALID_PARTY_STATEにして作成しない", async (_label, party, request) => {
    partyFindFirst.mockResolvedValue(party);

    await expect(service.create(userId, request)).rejects.toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        status: 400,
        code: "INVALID_PARTY_STATE",
        errors: expect.any(Array),
      },
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("作成失敗をRFC 9457形式の500にし、transaction外へ部分保存しない", async () => {
    sessionCreate.mockRejectedValue(new Error("create failed"));

    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(sessionCreate).toHaveBeenCalledOnce();
  });

  it("取得はsession IDと所有者を同時に条件にし、他人と不存在を404にする", async () => {
    await expect(service.get(userId, sessionId)).resolves.toMatchObject({ id: sessionId });
    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: sessionId, userId } }),
    );

    sessionFindFirst.mockResolvedValueOnce(null);
    await expect(service.get(otherUserId, sessionId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
  });

  it("作成時の外部キー競合を404へ秘匿する", async () => {
    sessionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key failed", {
        code: "P2003",
        clientVersion: "6.19.3",
      }),
    );

    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
  });
});
