import { Prisma } from "@pokemon-champions/database";
import { observationCreateSchema } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

const now = new Date("2026-07-26T02:00:00.000Z");
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const observationId = "86ce163f-9d78-4776-b00b-34598734a7cd";
const previousObservationId = "b2a70c4d-8a2b-48c0-a8df-ed868fc6ef1b";

const latestObservation = {
  id: observationId,
  sessionId,
  seq: 3,
  kind: "move",
  pokemonId: 1,
  moveId: 2,
  itemId: null,
  abilityId: null,
  position: null,
  isRevoked: false,
  observedAt: now,
};

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("transaction failed", {
    code,
    clientVersion: "6.19.3",
  });
}

describe("SessionsService.undoObservation", () => {
  const sessionFindFirst = vi.fn();
  const observationFindFirst = vi.fn();
  const observationUpdateMany = vi.fn();
  const observationDelete = vi.fn();
  const observationAggregate = vi.fn();
  const observationCreate = vi.fn();
  const pokemonFindUnique = vi.fn();
  const transaction = {
    battleSession: { findFirst: sessionFindFirst },
    pokemon: { findUnique: pokemonFindUnique },
    observation: {
      findFirst: observationFindFirst,
      updateMany: observationUpdateMany,
      delete: observationDelete,
      aggregate: observationAggregate,
      create: observationCreate,
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
    sessionFindFirst.mockResolvedValue({ id: sessionId, status: "active" });
    observationFindFirst.mockResolvedValue(latestObservation);
    observationUpdateMany.mockResolvedValue({ count: 1 });
    observationAggregate.mockResolvedValue({ _max: { seq: 3 } });
    pokemonFindUnique.mockResolvedValue({ abilities: [], isMega: false });
    observationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: previousObservationId,
      ...data,
      observedAt: now,
    }));
  });

  it("直近の有効な観測1件だけをisRevoked=trueへ更新する", async () => {
    await expect(service.undoObservation(userId, sessionId, observationId)).resolves.toEqual({
      id: observationId,
      sessionId,
      seq: 3,
      kind: "move",
      pokemonId: 1,
      moveId: 2,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: true,
      createdAt: now.toISOString(),
    });

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: sessionId, userId } }),
    );
    expect(observationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId, isRevoked: false },
        orderBy: { seq: "desc" },
      }),
    );
    expect(observationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: observationId,
        sessionId,
        seq: 3,
        isRevoked: false,
      },
      data: { isRevoked: true },
    });
    expect(observationDelete).not.toHaveBeenCalled();
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("取消済みを検索対象外にし、最大seqの直近有効観測だけをUndoする", async () => {
    observationFindFirst.mockResolvedValue({
      ...latestObservation,
      id: previousObservationId,
      seq: 2,
    });

    const result = await service.undoObservation(userId, sessionId, previousObservationId);

    expect(result).toMatchObject({ id: previousObservationId, seq: 2, isRevoked: true });
    expect(observationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId, isRevoked: false },
        orderBy: { seq: "desc" },
      }),
    );
    expect(observationUpdateMany).toHaveBeenCalledOnce();
  });

  it("Observationを物理削除せず、seqと内容を変更しない", async () => {
    const result = await service.undoObservation(userId, sessionId, observationId);

    expect(result).toMatchObject({
      seq: latestObservation.seq,
      kind: latestObservation.kind,
      pokemonId: latestObservation.pokemonId,
      moveId: latestObservation.moveId,
    });
    expect(observationUpdateMany.mock.calls[0]?.[0].data).toEqual({ isRevoked: true });
    expect(observationDelete).not.toHaveBeenCalled();
  });

  it("Undo後の観測追加でも取消済みを含む最大seqの次を採番する", async () => {
    await service.undoObservation(userId, sessionId, observationId);

    const added = await service.addObservation(
      userId,
      sessionId,
      observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 }),
    );

    expect(added.seq).toBe(4);
    expect(observationAggregate).toHaveBeenCalledWith({
      where: { sessionId },
      _max: { seq: true },
    });
    expect(observationCreate.mock.calls[0]?.[0].data.seq).toBe(4);
  });

  it("有効なObservationが0件なら409 OBSERVATION_CONFLICTにする", async () => {
    observationFindFirst.mockResolvedValue(null);

    await expect(service.undoObservation(userId, sessionId, observationId)).rejects.toMatchObject({
      status: 409,
      response: {
        type: "about:blank",
        status: 409,
        code: "OBSERVATION_CONFLICT",
      },
    });
    expect(observationUpdateMany).not.toHaveBeenCalled();
  });

  it("obsIdが直近有効観測と異なる場合は409にして更新しない", async () => {
    await expect(
      service.undoObservation(userId, sessionId, previousObservationId),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "OBSERVATION_CONFLICT" },
    });
    expect(observationUpdateMany).not.toHaveBeenCalled();
  });

  it("他人のSessionと不存在Sessionを同じ404にして更新しない", async () => {
    sessionFindFirst.mockResolvedValue(null);

    for (const callerId of [otherUserId, userId]) {
      await expect(
        service.undoObservation(callerId, sessionId, observationId),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
    expect(observationFindFirst).not.toHaveBeenCalled();
    expect(observationUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["ended", "archived"])("%s SessionのUndoを400にして更新しない", async (status) => {
    sessionFindFirst.mockResolvedValue({ id: sessionId, status });

    await expect(service.undoObservation(userId, sessionId, observationId)).rejects.toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        status: 400,
        code: "INVALID_SESSION_STATE",
      },
    });
    expect(observationFindFirst).not.toHaveBeenCalled();
    expect(observationUpdateMany).not.toHaveBeenCalled();
  });

  it("同時Undoでは条件付き更新により同じObservationを二重成功させない", async () => {
    let active = true;
    let readers = 0;
    let releaseReaders: (() => void) | undefined;
    const bothRead = new Promise<void>((resolve) => {
      releaseReaders = resolve;
    });
    const concurrentTransaction = {
      battleSession: {
        findFirst: vi.fn().mockResolvedValue({ id: sessionId, status: "active" }),
      },
      observation: {
        findFirst: vi.fn(async () => {
          const snapshot = active ? latestObservation : null;
          readers += 1;
          if (readers === 2) {
            releaseReaders?.();
          }
          await bothRead;
          return snapshot;
        }),
        updateMany: vi.fn(async () => {
          if (!active) {
            return { count: 0 };
          }
          active = false;
          return { count: 1 };
        }),
      },
    };
    const concurrentRunTransaction = vi.fn(
      async (operation: (client: typeof concurrentTransaction) => Promise<unknown>) =>
        operation(concurrentTransaction),
    );
    const concurrentService = new SessionsService({
      $transaction: concurrentRunTransaction,
    } as unknown as PrismaService);

    const results = await Promise.allSettled([
      concurrentService.undoObservation(userId, sessionId, observationId),
      concurrentService.undoObservation(userId, sessionId, observationId),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(concurrentTransaction.observation.updateMany).toHaveBeenCalledTimes(2);
  });

  it("Serializable競合をtransaction全体で再試行する", async () => {
    runTransaction.mockRejectedValueOnce(knownError("P2034"));

    await expect(service.undoObservation(userId, sessionId, observationId)).resolves.toMatchObject({
      isRevoked: true,
    });
    expect(runTransaction).toHaveBeenCalledTimes(2);
  });

  it("更新失敗を安全な500にし、部分更新や物理削除を行わない", async () => {
    observationUpdateMany.mockRejectedValue(new Error("write failed"));

    await expect(service.undoObservation(userId, sessionId, observationId)).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(latestObservation.isRevoked).toBe(false);
    expect(observationDelete).not.toHaveBeenCalled();
  });
});
