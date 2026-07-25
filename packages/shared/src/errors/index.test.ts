import { describe, expect, it } from "vitest";
import { APP_ERROR_CODES, problemDetailsSchema } from "./index";

describe("rate limit Problem Details contract", () => {
  it("RATE_LIMITEDを共有エラーコードとして公開する", () => {
    expect(APP_ERROR_CODES).toContain("RATE_LIMITED");
  });

  it("RFC 9457形式の429レスポンスを検証できる", () => {
    expect(
      problemDetailsSchema.parse({
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Observation request rate limit exceeded.",
        instance: "/api/v1/sessions/id/observations",
        code: "RATE_LIMITED",
      }),
    ).toEqual({
      type: "about:blank",
      title: "Too Many Requests",
      status: 429,
      detail: "Observation request rate limit exceeded.",
      instance: "/api/v1/sessions/id/observations",
      code: "RATE_LIMITED",
    });
  });
});
