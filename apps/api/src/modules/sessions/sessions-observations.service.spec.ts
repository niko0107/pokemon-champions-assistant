import { Prisma } from "@pokemon-champions/database";
import { observationCreateSchema, type ObservationCreate } from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

const now = new Date("2026-07-26T01:00:00.000Z");
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const observationId = "86ce163f-9d78-4776-b00b-34598734a7cd";

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("transaction failed", {
    code,
    clientVersion: "6.19.3",
  });
}

describe("SessionsService.addObservation", () => {
  const sessionFindFirst = vi.fn();
  const sessionUpdateMany = vi.fn();
  const pokemonFindUnique = vi.fn();
  const moveFindUnique = vi.fn();
  const pokemonMoveFindUnique = vi.fn();
  const itemFindUnique = vi.fn();
  const abilityFindUnique = vi.fn();
  const observationAggregate = vi.fn();
  const observationCreate = vi.fn();
  const transaction = {
    battleSession: {
      findFirst: sessionFindFirst,
      updateMany: sessionUpdateMany,
    },
    pokemon: { findUnique: pokemonFindUnique },
    move: { findUnique: moveFindUnique },
    pokemonMove: { findUnique: pokemonMoveFindUnique },
    item: { findUnique: itemFindUnique },
    ability: { findUnique: abilityFindUnique },
    observation: {
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
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    pokemonFindUnique.mockResolvedValue({ abilities: ["いかく"], isMega: true });
    moveFindUnique.mockResolvedValue({ id: 2 });
    pokemonMoveFindUnique.mockResolvedValue({ pokemonId: 1 });
    itemFindUnique.mockResolvedValue({ id: 3 });
    abilityFindUnique.mockResolvedValue({ nameJa: "いかく" });
    observationAggregate.mockResolvedValue({ _max: { seq: null } });
    observationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: observationId,
      ...data,
      observedAt: now,
    }));
  });

  it.each([
    [{ kind: "pokemon", pokemonId: 1 }, null, null, null, null],
    [{ kind: "move", pokemonId: 1, moveId: 2 }, 2, null, null, null],
    [{ kind: "item", pokemonId: 1, itemId: 3 }, null, 3, null, null],
    [{ kind: "ability", pokemonId: 1, abilityId: 4 }, null, null, 4, null],
    [{ kind: "position", pokemonId: 1, position: "back" }, null, null, null, "back"],
    [{ kind: "mega", pokemonId: 1 }, null, null, null, null],
  ] as const)(
    "%s観測をkind別payloadだけで保存する",
    async (rawInput, moveId, itemId, abilityId, position) => {
      const input = observationCreateSchema.parse(rawInput);
      const response = await service.addObservation(userId, sessionId, input);

      expect(response).toEqual({
        id: observationId,
        sessionId,
        seq: 1,
        kind: input.kind,
        pokemonId: 1,
        moveId,
        itemId,
        abilityId,
        position,
        isRevoked: false,
        createdAt: now.toISOString(),
      });
      expect(sessionFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: sessionId, userId } }),
      );
      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { id: sessionId, userId, status: "active" },
        data: { updatedAt: expect.any(Date) },
      });
      expect(observationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sessionId,
            seq: 1,
            kind: input.kind,
            pokemonId: 1,
            moveId,
            itemId,
            abilityId,
            position,
            isRevoked: false,
          },
        }),
      );
      expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
    },
  );

  it("seqを1からサーバー側で単調増加させる", async () => {
    observationAggregate
      .mockResolvedValueOnce({ _max: { seq: null } })
      .mockResolvedValueOnce({ _max: { seq: 1 } });
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    const first = await service.addObservation(userId, sessionId, input);
    const second = await service.addObservation(userId, sessionId, input);

    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(observationCreate.mock.calls.map((call) => call[0].data.seq)).toEqual([1, 2]);
  });

  it("他人のSessionと不存在Sessionを同じ404にして保存しない", async () => {
    sessionFindFirst.mockResolvedValue(null);
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    for (const callerId of [otherUserId, userId]) {
      await expect(service.addObservation(callerId, sessionId, input)).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
    expect(observationCreate).not.toHaveBeenCalled();
  });

  it.each(["ended", "archived"])("%s Sessionへの追加を400にして保存しない", async (status) => {
    sessionFindFirst.mockResolvedValue({ id: sessionId, status });
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    await expect(service.addObservation(userId, sessionId, input)).rejects.toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        status: 400,
        code: "INVALID_SESSION_STATE",
      },
    });
    expect(pokemonFindUnique).not.toHaveBeenCalled();
    expect(observationCreate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "存在しないPokemon",
      { kind: "pokemon", pokemonId: 1 },
      () => pokemonFindUnique.mockResolvedValue(null),
    ],
    [
      "存在しないMove",
      { kind: "move", pokemonId: 1, moveId: 2 },
      () => moveFindUnique.mockResolvedValue(null),
    ],
    [
      "習得不能Move",
      { kind: "move", pokemonId: 1, moveId: 2 },
      () => pokemonMoveFindUnique.mockResolvedValue(null),
    ],
    [
      "存在しないItem",
      { kind: "item", pokemonId: 1, itemId: 3 },
      () => itemFindUnique.mockResolvedValue(null),
    ],
    [
      "存在しないAbility",
      { kind: "ability", pokemonId: 1, abilityId: 4 },
      () => abilityFindUnique.mockResolvedValue(null),
    ],
    [
      "所持不能Ability",
      { kind: "ability", pokemonId: 1, abilityId: 4 },
      () => abilityFindUnique.mockResolvedValue({ nameJa: "別の特性" }),
    ],
    [
      "非メガPokemon",
      { kind: "mega", pokemonId: 1 },
      () => pokemonFindUnique.mockResolvedValue({ abilities: ["いかく"], isMega: false }),
    ],
  ] as const)("%sを400 INVALID_MASTER_REFERENCEにして保存しない", async (_label, raw, arrange) => {
    arrange();
    const input = observationCreateSchema.parse(raw);

    await expect(service.addObservation(userId, sessionId, input)).rejects.toMatchObject({
      status: 400,
      response: {
        type: "about:blank",
        status: 400,
        code: "INVALID_MASTER_REFERENCE",
        errors: expect.any(Array),
      },
    });
    expect(observationCreate).not.toHaveBeenCalled();
  });

  it("同じ観測の重複を許可し、別seqで追記する", async () => {
    observationAggregate
      .mockResolvedValueOnce({ _max: { seq: 4 } })
      .mockResolvedValueOnce({ _max: { seq: 5 } });
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    const results = await Promise.all([
      service.addObservation(userId, sessionId, input),
      service.addObservation(userId, sessionId, input),
    ]);

    expect(results.map((result) => result.seq)).toEqual([5, 6]);
    expect(observationCreate).toHaveBeenCalledTimes(2);
  });

  it("P2034をtransaction全体で再試行し、成功時は409を返さない", async () => {
    runTransaction.mockRejectedValueOnce(knownError("P2034"));
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    await expect(service.addObservation(userId, sessionId, input)).resolves.toMatchObject({
      seq: 1,
    });
    expect(runTransaction).toHaveBeenCalledTimes(2);
  });

  it("競合が3回続いた場合だけ409 OBSERVATION_CONFLICTにする", async () => {
    runTransaction.mockRejectedValue(knownError("P2034"));
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    await expect(service.addObservation(userId, sessionId, input)).rejects.toMatchObject({
      status: 409,
      response: {
        type: "about:blank",
        status: 409,
        code: "OBSERVATION_CONFLICT",
      },
    });
    expect(runTransaction).toHaveBeenCalledTimes(3);
  });

  it("同時追加の一意競合を再試行し、seqを重複させない", async () => {
    const storedSeqs: number[] = [];
    let aggregateCount = 0;
    let releaseFirstPair: (() => void) | undefined;
    const firstPairReady = new Promise<void>((resolve) => {
      releaseFirstPair = resolve;
    });
    const concurrentTransaction = {
      ...transaction,
      observation: {
        aggregate: vi.fn(async () => {
          const snapshot = storedSeqs.length === 0 ? null : Math.max(...storedSeqs);
          aggregateCount += 1;
          if (aggregateCount === 2) {
            releaseFirstPair?.();
          }
          if (aggregateCount <= 2) {
            await firstPairReady;
          }
          return { _max: { seq: snapshot } };
        }),
        create: vi.fn(async ({ data }: { data: Prisma.ObservationUncheckedCreateInput }) => {
          if (storedSeqs.includes(data.seq)) {
            throw knownError("P2002");
          }
          storedSeqs.push(data.seq);
          return { id: observationId, ...data, observedAt: now };
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
    const input: ObservationCreate = observationCreateSchema.parse({
      kind: "pokemon",
      pokemonId: 1,
    });

    const results = await Promise.all([
      concurrentService.addObservation(userId, sessionId, input),
      concurrentService.addObservation(userId, sessionId, input),
    ]);

    expect(results.map((result) => result.seq).sort()).toEqual([1, 2]);
    expect(storedSeqs.sort()).toEqual([1, 2]);
    expect(concurrentRunTransaction).toHaveBeenCalledTimes(3);
  });

  it("予期しない作成失敗を安全な500にし、処理をtransaction内に閉じる", async () => {
    observationCreate.mockRejectedValue(new Error("write failed"));
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    await expect(service.addObservation(userId, sessionId, input)).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(observationCreate).toHaveBeenCalledOnce();
  });

  it("archiveとの競合でactive Sessionを更新できなければ観測を保存しない", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    const input = observationCreateSchema.parse({ kind: "pokemon", pokemonId: 1 });

    await expect(service.addObservation(userId, sessionId, input)).rejects.toMatchObject({
      status: 409,
      response: { code: "OBSERVATION_CONFLICT" },
    });
    expect(pokemonFindUnique).not.toHaveBeenCalled();
    expect(observationCreate).not.toHaveBeenCalled();
  });
});
