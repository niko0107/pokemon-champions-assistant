import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "@pokemon-champions/shared";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./authenticated-request";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

class GuardTarget {
  @Roles("admin")
  adminOnly(): void {}

  unrestricted(): void {}
}

function createContext(
  handler: "adminOnly" | "unrestricted",
  user?: AuthenticatedUser,
): ExecutionContext {
  const request = { headers: {}, user } as AuthenticatedRequest;

  return {
    getHandler: () => GuardTarget.prototype[handler],
    getClass: () => GuardTarget,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("admin roleを許可する", () => {
    expect(
      guard.canActivate(
        createContext("adminOnly", {
          id: "95335a95-31d1-429d-87e3-8921d2b05d08",
          role: "admin",
        }),
      ),
    ).toBe(true);
  });

  it("user roleを403にする", () => {
    expect(() =>
      guard.canActivate(
        createContext("adminOnly", {
          id: "fecccd4a-a137-4b3b-bb09-239306040706",
          role: "user",
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: "FORBIDDEN" }),
      }),
    );
  });

  it("認証情報がない場合は401にする", () => {
    expect(() => guard.canActivate(createContext("adminOnly"))).toThrow(
      expect.objectContaining({
        status: 401,
        response: expect.objectContaining({ code: "UNAUTHORIZED" }),
      }),
    );
  });

  it("role指定がないルートは認証済みroleに関係なく通す", () => {
    expect(guard.canActivate(createContext("unrestricted"))).toBe(true);
  });
});
