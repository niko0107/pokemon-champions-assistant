import { describe, expect, it } from "vitest";
import {
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  battleSessionStatusSchema,
  observationCreateSchema,
  observationKindSchema,
  observationResponseSchema,
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
