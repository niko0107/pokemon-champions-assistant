import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("status=ok を受理する", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("status=ok 以外を拒否する", () => {
    expect(healthResponseSchema.safeParse({ status: "ng" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });
});
