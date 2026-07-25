import { describe, expect, it } from "vitest";
import {
  battleCandidateSelectResponseSchema,
  battleCandidateSelectSchema,
  battleCandidatesResponseSchema,
  battleSessionEndResponseSchema,
  battleSessionEndSchema,
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  battleSessionStatusSchema,
  observationCreateSchema,
  observationKindSchema,
  observationResponseSchema,
  undoObservationParamsSchema,
  undoObservationResponseSchema,
} from "./sessions";

const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const timestamp = "2026-07-26T00:00:00.000Z";
const observationId = "86ce163f-9d78-4776-b00b-34598734a7cd";

describe("BATTLE-001 shared API schemas", () => {
  it("正常なセッション作成入力を受理する", () => {
    expect(battleSessionCreateSchema.parse({ partyId, ruleId: 1 })).toEqual({
      partyId,
      ruleId: 1,
    });
  });

  it("不正なpartyIdを拒否する", () => {
    expect(battleSessionCreateSchema.safeParse({ partyId: "not-a-uuid", ruleId: 1 }).success).toBe(
      false,
    );
  });

  it("strict入力としてuserIdなどの契約外フィールドを拒否する", () => {
    expect(
      battleSessionCreateSchema.safeParse({
        partyId,
        ruleId: 1,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
      }).success,
    ).toBe(false);
  });

  it("正常レスポンスと許可されたstatusを受理する", () => {
    const response = {
      id: sessionId,
      partyId,
      ruleId: 1,
      status: "active",
      startedAt: timestamp,
      endedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(battleSessionResponseSchema.parse(response)).toEqual(response);
    expect(battleSessionStatusSchema.parse("ended")).toBe("ended");
    expect(battleSessionStatusSchema.parse("archived")).toBe("archived");
  });

  it("不正なstatusを拒否する", () => {
    expect(battleSessionStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("userIdや認証情報などの内部情報をレスポンスとして拒否する", () => {
    expect(
      battleSessionResponseSchema.safeParse({
        id: sessionId,
        partyId,
        ruleId: 1,
        status: "active",
        startedAt: timestamp,
        endedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
        passwordHash: "secret",
        accessToken: "secret",
      }).success,
    ).toBe(false);
  });
});

describe("BATTLE-002 shared API schemas", () => {
  const validInputs = [
    { kind: "pokemon", pokemonId: 1 },
    { kind: "move", pokemonId: 1, moveId: 2 },
    { kind: "item", pokemonId: 1, itemId: 3 },
    { kind: "ability", pokemonId: 1, abilityId: 4 },
    { kind: "position", pokemonId: 1, position: "lead" },
    { kind: "mega", pokemonId: 1 },
  ] as const;

  it.each(validInputs)("%s観測の正常入力を受理する", (input) => {
    expect(observationCreateSchema.parse(input)).toEqual(input);
  });

  it.each([
    { kind: "pokemon" },
    { kind: "move", pokemonId: 1 },
    { kind: "item", pokemonId: 1 },
    { kind: "ability", pokemonId: 1 },
    { kind: "position", pokemonId: 1 },
    { kind: "mega" },
  ])("kindごとの必須フィールド不足を拒否する", (input) => {
    expect(observationCreateSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { kind: "pokemon", pokemonId: 1, moveId: 2 },
    { kind: "move", pokemonId: 1, moveId: 2, itemId: 3 },
    { kind: "item", pokemonId: 1, itemId: 3, abilityId: 4 },
    { kind: "ability", pokemonId: 1, abilityId: 4, position: "lead" },
    { kind: "position", pokemonId: 1, position: "lead", moveId: 2 },
    { kind: "mega", pokemonId: 1, isMega: true },
  ])("kindごとの不要フィールド混入を拒否する", (input) => {
    expect(observationCreateSchema.safeParse(input).success).toBe(false);
  });

  it.each([0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])(
    "不正なマスタID %s を拒否する",
    (pokemonId) => {
      expect(observationCreateSchema.safeParse({ kind: "pokemon", pokemonId }).success).toBe(false);
    },
  );

  it("不正なpositionを拒否する", () => {
    expect(
      observationCreateSchema.safeParse({
        kind: "position",
        pokemonId: 1,
        position: "ace",
      }).success,
    ).toBe(false);
  });

  it.each(["seq", "isRevoked", "sessionId", "userId", "createdAt"])(
    "strict入力として%sを受け取らない",
    (field) => {
      expect(
        observationCreateSchema.safeParse({
          kind: "pokemon",
          pokemonId: 1,
          [field]: field === "seq" ? 1 : "internal",
        }).success,
      ).toBe(false);
    },
  );

  it("正常レスポンスを受理し、内部情報を拒否する", () => {
    const response = {
      id: observationId,
      sessionId,
      seq: 1,
      kind: "move",
      pokemonId: 1,
      moveId: 2,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: false,
      createdAt: timestamp,
    };

    expect(observationResponseSchema.parse(response)).toEqual(response);
    expect(
      observationResponseSchema.safeParse({
        ...response,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
        accessToken: "secret",
      }).success,
    ).toBe(false);
  });

  it("不正なkindを拒否する", () => {
    expect(observationKindSchema.safeParse("result").success).toBe(false);
  });
});

describe("BATTLE-003 shared API schemas", () => {
  it("正常なUndo paramsを受理する", () => {
    expect(
      undoObservationParamsSchema.parse({
        id: sessionId,
        obsId: observationId,
      }),
    ).toEqual({
      id: sessionId,
      obsId: observationId,
    });
  });

  it.each([
    { id: "not-a-uuid", obsId: observationId },
    { id: sessionId, obsId: "not-a-uuid" },
  ])("不正なUUIDを拒否する", (params) => {
    expect(undoObservationParamsSchema.safeParse(params).success).toBe(false);
  });

  it("strict paramsとして契約外フィールドを拒否する", () => {
    expect(
      undoObservationParamsSchema.safeParse({
        id: sessionId,
        obsId: observationId,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
      }).success,
    ).toBe(false);
  });

  it("isRevoked=trueの正常レスポンスを受理する", () => {
    const response = {
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
      createdAt: timestamp,
    };

    expect(undoObservationResponseSchema.parse(response)).toEqual(response);
  });

  it("isRevoked=falseと内部情報をレスポンスとして拒否する", () => {
    const response = {
      id: observationId,
      sessionId,
      seq: 3,
      kind: "pokemon",
      pokemonId: 1,
      moveId: null,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: true,
      createdAt: timestamp,
    };

    expect(
      undoObservationResponseSchema.safeParse({
        ...response,
        isRevoked: false,
      }).success,
    ).toBe(false);
    expect(
      undoObservationResponseSchema.safeParse({
        ...response,
        userId: "fecccd4a-a137-4b3b-bb09-239306040706",
        accessToken: "secret",
      }).success,
    ).toBe(false);
  });
});

describe("BATTLE-004 shared API schemas", () => {
  const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";
  const candidate = {
    archetypeId,
    name: "展開構築",
    matchRate: 100,
    rank: 1,
    popularityTier: "high",
    matched: [
      {
        observationSeq: 1,
        kind: "pokemon",
        matched: true,
        points: 10,
        pokemonId: 1,
      },
    ],
    contradictions: [],
    exclusionCodes: [],
    likelyUnseen: [{ pokemonId: 2, usageRate: 1 }],
    threatMoveIds: [3],
  };

  it("候補0件と候補1〜3件のレスポンスを受理する", () => {
    expect(battleCandidatesResponseSchema.parse({ sessionId, candidates: [] })).toEqual({
      sessionId,
      candidates: [],
    });

    const candidates = [1, 2, 3].map((rank) => ({ ...candidate, rank }));
    expect(battleCandidatesResponseSchema.parse({ sessionId, candidates })).toEqual({
      sessionId,
      candidates,
    });
  });

  it("候補4件とcandidateの契約外フィールドを拒否する", () => {
    expect(
      battleCandidatesResponseSchema.safeParse({
        sessionId,
        candidates: [1, 2, 3, 4].map((rank) => ({ ...candidate, rank })),
      }).success,
    ).toBe(false);
    expect(
      battleCandidatesResponseSchema.safeParse({
        sessionId,
        candidates: [{ ...candidate, rawScore: 10, userId: "internal" }],
      }).success,
    ).toBe(false);
  });

  it("候補選択入力とレスポンスをstrictに検証する", () => {
    expect(battleCandidateSelectSchema.parse({ archetypeId })).toEqual({ archetypeId });
    expect(battleCandidateSelectSchema.safeParse({ archetypeId, userId: "internal" }).success).toBe(
      false,
    );
    expect(
      battleCandidateSelectResponseSchema.parse({
        sessionId,
        selectedArchetypeId: archetypeId,
        status: "active",
        updatedAt: timestamp,
      }),
    ).toEqual({
      sessionId,
      selectedArchetypeId: archetypeId,
      status: "active",
      updatedAt: timestamp,
    });
  });

  it("終了入力は空または任意resultを受理し、契約外フィールドを拒否する", () => {
    expect(battleSessionEndSchema.parse({})).toEqual({});
    expect(battleSessionEndSchema.parse({ result: "win" })).toEqual({ result: "win" });
    expect(battleSessionEndSchema.safeParse({ result: "draw" }).success).toBe(false);
    expect(battleSessionEndSchema.safeParse({ result: "lose", userId: "internal" }).success).toBe(
      false,
    );
  });

  it("ended status・timestamp・nullable選択を持つ終了レスポンスだけを受理する", () => {
    const response = {
      sessionId,
      selectedArchetypeId: archetypeId,
      status: "ended",
      result: "unknown",
      endedAt: timestamp,
      updatedAt: timestamp,
    };
    expect(battleSessionEndResponseSchema.parse(response)).toEqual(response);
    expect(
      battleSessionEndResponseSchema.safeParse({
        ...response,
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      battleSessionEndResponseSchema.safeParse({
        ...response,
        userId: "internal",
        accessToken: "secret",
      }).success,
    ).toBe(false);
  });
});
