import { Prisma } from "@pokemon-champions/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { BattleCandidatesCache } from "./session-candidates-cache";
import { SessionsService } from "./sessions.service";

const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const otherUserId = "95335a95-31d1-429d-87e3-8921d2b05d08";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const archetypeId = "11111111-1111-4111-8111-111111111111";

function observation(
  seq: number,
  kind: string,
  payload: Partial<{
    pokemonId: number | null;
    moveId: number | null;
    itemId: number | null;
    abilityId: number | null;
    position: string | null;
    isRevoked: boolean;
  }> = {},
): unknown {
  return {
    seq,
    kind,
    pokemonId: 10,
    moveId: null,
    itemId: null,
    abilityId: null,
    position: null,
    isRevoked: false,
    ...payload,
  };
}

function archetype(
  id: string,
  overrides: Partial<{
    name: string;
    popularityTier: string;
    encounterCount: number;
    updatedAt: Date;
    pokemonId: number;
    isMega: boolean;
    role: string;
  }> = {},
): unknown {
  const pokemonId = overrides.pokemonId ?? 10;
  return {
    id,
    name: overrides.name ?? `構築-${id}`,
    popularityTier: overrides.popularityTier ?? "mid",
    popularityScore: null,
    encounterCount: overrides.encounterCount ?? 0,
    defaultLeads: [1],
    updatedAt: overrides.updatedAt ?? new Date("2026-07-25T00:00:00.000Z"),
    pokemons: [
      {
        slot: 1,
        pokemonId,
        itemId: 20,
        itemAlternatives: [21],
        abilityId: 30,
        role: overrides.role ?? "lead",
        usageRate: new Prisma.Decimal(1),
        pokemon: { isMega: overrides.isMega ?? false },
        moves: [
          {
            moveId: 40,
            adoptionRate: new Prisma.Decimal(1),
            move: { tags: ["hazard"] },
          },
        ],
      },
    ],
  };
}

describe("SessionsService.getCandidates", () => {
  const sessionFindFirst = vi.fn();
  const archetypeFindMany = vi.fn();
  const service = new SessionsService({
    battleSession: { findFirst: sessionFindFirst },
    archetype: { findMany: archetypeFindMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [],
    });
    archetypeFindMany.mockResolvedValue([]);
  });

  it("観測0件・候補0件を200相当の空配列として返す", async () => {
    await expect(service.getCandidates(userId, sessionId)).resolves.toEqual({
      sessionId,
      candidates: [],
    });
  });

  it("Sessionを所有者込み、Observationをseq順で取得する", async () => {
    await service.getCandidates(userId, sessionId);

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId, userId },
        select: expect.objectContaining({
          observations: expect.objectContaining({ orderBy: [{ seq: "asc" }] }),
        }),
      }),
    );
  });

  it("現行Season・同一Rule・publishedだけをnested selectで最大500件取得する", async () => {
    await service.getCandidates(userId, sessionId);

    expect(archetypeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ruleId: 1,
          status: "published",
          season: {
            startsAt: { lte: expect.any(Date) },
            endsAt: { gte: expect.any(Date) },
          },
        },
        select: expect.objectContaining({
          pokemons: expect.objectContaining({
            select: expect.objectContaining({
              pokemon: { select: { isMega: true } },
              moves: expect.objectContaining({
                select: expect.objectContaining({
                  move: { select: { tags: true } },
                }),
              }),
            }),
          }),
        }),
        orderBy: [{ id: "asc" }],
        take: 500,
      }),
    );
  });

  it("pokemon観測から候補を算出し内部スコアを返さない", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [observation(1, "pokemon")],
    });
    archetypeFindMany.mockResolvedValue([archetype(archetypeId)]);

    const response = await service.getCandidates(userId, sessionId);

    expect(response.candidates[0]).toMatchObject({
      archetypeId,
      rank: 1,
      matchRate: 100,
      popularityTier: "mid",
      matched: [
        expect.objectContaining({
          observationSeq: 1,
          kind: "pokemon",
          matched: true,
        }),
      ],
    });
    expect(response.candidates[0]).not.toHaveProperty("rawScore");
    expect(response.candidates[0]).not.toHaveProperty("maxScore");
    expect(response.candidates[0]).not.toHaveProperty("excluded");
  });

  it("unclassifiedを含むpublished構築もcandidateとして決定的に返す", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [observation(1, "pokemon")],
    });
    archetypeFindMany.mockResolvedValue([archetype(archetypeId, { role: "unclassified" })]);

    const first = await service.getCandidates(userId, sessionId);
    const second = await service.getCandidates(userId, sessionId);

    expect(first).toEqual(second);
    expect(first.candidates[0]).toMatchObject({ archetypeId, rank: 1, matchRate: 100 });
  });

  it("move/item/ability/position/megaを型安全に変換し表示要素を保持する", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [
        observation(1, "pokemon"),
        observation(2, "move", { moveId: 40 }),
        observation(3, "item", { itemId: 20 }),
        observation(4, "ability", { abilityId: 30 }),
        observation(5, "position", { position: "lead" }),
        observation(6, "mega"),
      ],
    });
    archetypeFindMany.mockResolvedValue([archetype(archetypeId, { isMega: true })]);

    const response = await service.getCandidates(userId, sessionId);

    expect(response.candidates[0]).toMatchObject({
      matchRate: 100,
      exclusionCodes: [],
      likelyUnseen: [],
      threatMoveIds: [],
    });
    expect(response.candidates[0]?.matched.map((detail) => detail.kind)).toEqual([
      "pokemon",
      "move",
      "item",
      "ability",
      "position",
      "mega",
    ]);
  });

  it("Undo済みObservationを既存scoring仕様で無視する", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [
        observation(1, "pokemon"),
        observation(2, "pokemon", { pokemonId: 99, isRevoked: true }),
      ],
    });
    archetypeFindMany.mockResolvedValue([archetype(archetypeId)]);

    const response = await service.getCandidates(userId, sessionId);

    expect(response.candidates[0]?.matchRate).toBe(100);
    expect(response.candidates[0]?.matched).toHaveLength(1);
  });

  it("一致度同率を人気度→遭遇数→更新日→IDで並べて上位3件だけ返す", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [observation(1, "pokemon")],
    });
    const high = "44444444-4444-4444-8444-444444444444";
    const encounters = "33333333-3333-4333-8333-333333333333";
    const newer = "22222222-2222-4222-8222-222222222222";
    const older = "11111111-1111-4111-8111-111111111111";
    archetypeFindMany.mockResolvedValue([
      archetype(older),
      archetype(newer, { updatedAt: new Date("2026-07-26T00:00:00.000Z") }),
      archetype(encounters, { encounterCount: 2 }),
      archetype(high, { popularityTier: "high" }),
    ]);

    const response = await service.getCandidates(userId, sessionId);

    expect(response.candidates.map((candidate) => candidate.archetypeId)).toEqual([
      high,
      encounters,
      newer,
    ]);
    expect(response.candidates.map((candidate) => candidate.rank)).toEqual([1, 2, 3]);
  });

  it("excluded候補をrankCandidatesの既存方式で除外する", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [
        observation(1, "pokemon", { pokemonId: 90 }),
        observation(2, "pokemon", { pokemonId: 91 }),
        observation(3, "pokemon", { pokemonId: 92 }),
      ],
    });
    archetypeFindMany.mockResolvedValue([archetype(archetypeId)]);

    await expect(service.getCandidates(userId, sessionId)).resolves.toEqual({
      sessionId,
      candidates: [],
    });
  });

  it("他人と不存在Sessionを同じ404にする", async () => {
    sessionFindFirst.mockResolvedValue(null);

    for (const callerId of [otherUserId, userId]) {
      await expect(service.getCandidates(callerId, sessionId)).rejects.toMatchObject({
        status: 404,
        response: { code: "NOT_FOUND" },
      });
    }
    expect(archetypeFindMany).not.toHaveBeenCalled();
  });

  it("キャッシュが存在しても所有権確認を先行し、他人のSessionを404にする", async () => {
    sessionFindFirst.mockResolvedValue(null);
    const getOrCalculate = vi.fn();
    const cachedService = new SessionsService(
      {
        battleSession: { findFirst: sessionFindFirst },
        archetype: { findMany: archetypeFindMany },
      } as unknown as PrismaService,
      { getOrCalculate } as Pick<BattleCandidatesCache, "getOrCalculate">,
    );

    await expect(cachedService.getCandidates(otherUserId, sessionId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
    expect(getOrCalculate).not.toHaveBeenCalled();
  });

  it.each(["ended", "archived"])("%s Sessionの候補取得を400にする", async (status) => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status,
      selectedArchetypeId: null,
      observations: [],
    });

    await expect(service.getCandidates(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_SESSION_STATE" },
    });
  });

  it("キャッシュhit判定より前にSession状態を検証する", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "ended",
      selectedArchetypeId: null,
      observations: [],
    });
    const getOrCalculate = vi.fn();
    const cachedService = new SessionsService(
      {
        battleSession: { findFirst: sessionFindFirst },
        archetype: { findMany: archetypeFindMany },
      } as unknown as PrismaService,
      { getOrCalculate } as Pick<BattleCandidatesCache, "getOrCalculate">,
    );

    await expect(cachedService.getCandidates(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_SESSION_STATE" },
    });
    expect(getOrCalculate).not.toHaveBeenCalled();
  });

  it("不正なDB状態を候補から黙って落とさず安全な500にする", async () => {
    sessionFindFirst.mockResolvedValue({
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
      observations: [observation(1, "move", { moveId: null })],
    });

    await expect(service.getCandidates(userId, sessionId)).rejects.toMatchObject({
      status: 500,
      response: { code: "INTERNAL_ERROR" },
    });
  });
});
