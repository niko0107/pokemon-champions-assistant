import { Prisma } from "@pokemon-champions/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

const now = new Date("2026-07-26T03:00:00.000Z");
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const archetypeId = "11111111-1111-4111-8111-111111111111";

function candidateArchetype(
  overrides: Partial<{ id: string; status: string; ruleId: number }> = {},
): unknown {
  return {
    id: overrides.id ?? archetypeId,
    name: "展開構築",
    popularityTier: "high",
    popularityScore: null,
    encounterCount: 0,
    defaultLeads: [1],
    updatedAt: now,
    pokemons: [
      {
        slot: 1,
        pokemonId: 10,
        itemId: null,
        itemAlternatives: [],
        abilityId: null,
        role: "lead",
        usageRate: new Prisma.Decimal(1),
        pokemon: { isMega: false },
        moves: [],
      },
    ],
    status: overrides.status ?? "published",
    ruleId: overrides.ruleId ?? 1,
  };
}

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("transaction failed", {
    code,
    clientVersion: "6.19.3",
  });
}

describe("SessionsService.selectCandidate", () => {
  const sessionFindFirst = vi.fn();
  const sessionUpdateMany = vi.fn();
  const sessionFindUnique = vi.fn();
  const archetypeFindMany = vi.fn();
  const archetypeUpdateMany = vi.fn();
  const transaction = {
    battleSession: {
      findFirst: sessionFindFirst,
      updateMany: sessionUpdateMany,
      findUnique: sessionFindUnique,
    },
    archetype: {
      findMany: archetypeFindMany,
      updateMany: archetypeUpdateMany,
    },
  };
  const runTransaction = vi.fn(
    async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
  );
  const service = new SessionsService({
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    runTransaction.mockImplementation(
      async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
    );
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [],
    });
    archetypeFindMany.mockResolvedValue([candidateArchetype()]);
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    archetypeUpdateMany.mockResolvedValue({ count: 1 });
    sessionFindUnique.mockResolvedValue({
      id: sessionId,
      status: "active",
      selectedArchetypeId: archetypeId,
      updatedAt: now,
    });
  });

  it("表示候補を選択しselectedArchetypeId保存とpickCount加算を原子的に行う", async () => {
    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).resolves.toEqual({
      sessionId,
      selectedArchetypeId: archetypeId,
      status: "active",
      updatedAt: now.toISOString(),
    });

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: sessionId, userId } }),
    );
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: sessionId,
        userId,
        status: "active",
        selectedArchetypeId: null,
      },
      data: { selectedArchetypeId: archetypeId },
    });
    expect(archetypeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: archetypeId,
          ruleId: 1,
          status: "published",
        }),
        data: { pickCount: { increment: 1 } },
      }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it.each([
    ["候補外", []],
    ["別Rule", []],
    ["archived", []],
  ])("%sの構築を400 INVALID_ARCHETYPE_SELECTIONにして保存しない", async (_label, rows) => {
    archetypeFindMany.mockResolvedValue(rows);

    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).rejects.toMatchObject(
      {
        status: 400,
        response: {
          type: "about:blank",
          status: 400,
          code: "INVALID_ARCHETYPE_SELECTION",
        },
      },
    );
    expect(sessionUpdateMany).not.toHaveBeenCalled();
    expect(archetypeUpdateMany).not.toHaveBeenCalled();
  });

  it("上位3件外のpublished同一Rule構築も候補外として拒否する", async () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    archetypeFindMany.mockResolvedValue(
      ids.map((id, index) =>
        candidateArchetype({
          id,
          ...(index === 3 ? {} : {}),
        }),
      ),
    );

    await expect(
      service.selectCandidate(userId, sessionId, { archetypeId: ids[3]! }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_ARCHETYPE_SELECTION" },
    });
  });

  it("同じ候補の再選択・候補変更を409にしてpickCountを二重加算しない", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: archetypeId,
      observations: [],
    });

    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).rejects.toMatchObject(
      {
        status: 409,
        response: { code: "BATTLE_CONFLICT" },
      },
    );
    expect(sessionUpdateMany).not.toHaveBeenCalled();
    expect(archetypeUpdateMany).not.toHaveBeenCalled();
  });

  it("他人と不存在Sessionを同じ404にする", async () => {
    sessionFindFirst.mockResolvedValue(null);

    for (const callerId of [otherUserId, userId]) {
      await expect(
        service.selectCandidate(callerId, sessionId, { archetypeId }),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
  });

  it.each(["ended", "archived"])("%s Sessionでは選択を400にする", async (status) => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status,
      selectedArchetypeId: null,
      observations: [],
    });

    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).rejects.toMatchObject(
      {
        status: 400,
        response: { code: "INVALID_SESSION_STATE" },
      },
    );
  });

  it("Serializable競合を再試行し、継続時は409にする", async () => {
    runTransaction.mockRejectedValue(knownError("P2034"));

    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).rejects.toMatchObject(
      {
        status: 409,
        response: { code: "BATTLE_CONFLICT" },
      },
    );
    expect(runTransaction).toHaveBeenCalledTimes(3);
  });

  it("pickCount更新失敗時はtransactionを失敗させ、部分成功レスポンスを返さない", async () => {
    archetypeUpdateMany.mockRejectedValue(new Error("increment failed"));

    await expect(service.selectCandidate(userId, sessionId, { archetypeId })).rejects.toMatchObject(
      {
        status: 500,
        response: { code: "INTERNAL_ERROR" },
      },
    );
    expect(sessionFindUnique).not.toHaveBeenCalled();
  });
});

describe("SessionsService.end", () => {
  const sessionFindFirst = vi.fn();
  const sessionUpdateMany = vi.fn();
  const sessionFindUnique = vi.fn();
  const transaction = {
    battleSession: {
      findFirst: sessionFindFirst,
      updateMany: sessionUpdateMany,
      findUnique: sessionFindUnique,
    },
  };
  const runTransaction = vi.fn(
    async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
  );
  const service = new SessionsService({
    $transaction: runTransaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    runTransaction.mockImplementation(
      async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
    );
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      status: "active",
      selectedArchetypeId: archetypeId,
      result: null,
      endedAt: null,
      updatedAt: now,
    });
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    sessionFindUnique.mockResolvedValue({
      id: sessionId,
      status: "ended",
      selectedArchetypeId: archetypeId,
      result: "win",
      endedAt: now,
      updatedAt: now,
    });
  });

  it("active Sessionをendedへ変更しendedAt・任意resultを保存して選択を維持する", async () => {
    await expect(service.end(userId, sessionId, { result: "win" })).resolves.toEqual({
      sessionId,
      selectedArchetypeId: archetypeId,
      status: "ended",
      result: "win",
      endedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: sessionId, userId, status: "active" },
      data: {
        status: "ended",
        endedAt: expect.any(Date),
        result: "win",
      },
    });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("result省略時は既存resultを書き換えず、候補未選択でも終了できる", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      status: "active",
      selectedArchetypeId: null,
      result: null,
      endedAt: null,
      updatedAt: now,
    });
    sessionFindUnique.mockResolvedValue({
      id: sessionId,
      status: "ended",
      selectedArchetypeId: null,
      result: null,
      endedAt: now,
      updatedAt: now,
    });

    const response = await service.end(userId, sessionId, {});

    expect(response.selectedArchetypeId).toBeNull();
    expect(response.result).toBeNull();
    expect(sessionUpdateMany.mock.calls[0]?.[0].data).not.toHaveProperty("result");
  });

  it.each(["ended", "archived"])("既に%sのSessionは400にして再終了しない", async (status) => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      status,
      selectedArchetypeId: archetypeId,
      result: null,
      endedAt: now,
      updatedAt: now,
    });

    await expect(service.end(userId, sessionId, {})).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_SESSION_STATE" },
    });
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("同時終了の条件付き更新競合を409にする", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.end(userId, sessionId, {})).rejects.toMatchObject({
      status: 409,
      response: { code: "BATTLE_CONFLICT" },
    });
    expect(sessionFindUnique).not.toHaveBeenCalled();
  });

  it("Serializable競合を409にする", async () => {
    runTransaction.mockRejectedValue(knownError("P2034"));

    await expect(service.end(userId, sessionId, {})).rejects.toMatchObject({
      status: 409,
      response: { code: "BATTLE_CONFLICT" },
    });
  });

  it("他人と不存在Sessionを同じ404にする", async () => {
    sessionFindFirst.mockResolvedValue(null);

    for (const callerId of [otherUserId, userId]) {
      await expect(service.end(callerId, sessionId, {})).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });
});
