import { describe, expect, it } from "vitest";
import {
  battleSessionCreateSchema,
  battleSessionResponseSchema,
  battleSessionStatusSchema,
} from "./sessions";

const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const timestamp = "2026-07-26T00:00:00.000Z";

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
