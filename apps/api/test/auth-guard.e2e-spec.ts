import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  API_PREFIX,
  type AuthenticatedUser,
  problemDetailsSchema,
} from "@pokemon-champions/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CurrentUser } from "../src/common/auth/current-user.decorator";
import { JwtAuthGuard } from "../src/common/auth/jwt-auth.guard";
import { Roles } from "../src/common/auth/roles.decorator";
import { RolesGuard } from "../src/common/auth/roles.guard";

const TEST_ACCESS_SECRET = "auth-004-api-access-secret-at-least-32-bytes";
const OTHER_ACCESS_SECRET = "auth-004-api-other-secret-at-least-32-bytes";
const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const adminId = "95335a95-31d1-429d-87e3-8921d2b05d08";

@Controller("test/auth")
@UseGuards(JwtAuthGuard, RolesGuard)
class ProtectedTestController {
  @Get("me")
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get("admin")
  @Roles("admin")
  getAdmin(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

@Controller("test/public")
class PublicTestController {
  @Get()
  getPublic(): { status: "ok" } {
    return { status: "ok" };
  }
}

describe("AUTH-004 authorization guards", () => {
  let app: INestApplication;
  let jwt: JwtService;
  const previousSecret = process.env.JWT_ACCESS_SECRET;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProtectedTestController, PublicTestController],
      providers: [JwtService, JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  async function sign(
    payload: Record<string, unknown>,
    options: { secret?: string; expiresIn?: number } = {},
  ): Promise<string> {
    return jwt.signAsync(payload, {
      algorithm: "HS256",
      secret: options.secret ?? TEST_ACCESS_SECRET,
      expiresIn: options.expiresIn ?? 900,
    });
  }

  it("CurrentUserで検証済み認証情報を取得できる", async () => {
    const token = await sign({ sub: userId, role: "user" });

    await request(app.getHttpServer())
      .get("/api/v1/test/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { id: userId, role: "user" });
  });

  it.each([
    ["Authorizationなし", undefined],
    ["Bearer形式不正", "Basic credentials"],
  ])("%sをRFC 9457形式の共通401にする", async (_label, authorization) => {
    let operation = request(app.getHttpServer()).get("/api/v1/test/auth/me");
    if (authorization !== undefined) {
      operation = operation.set("Authorization", authorization);
    }

    const response = await operation.expect(401);
    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it.each([
    [
      "署名不正",
      () => sign({ sub: userId, role: "user" }, { secret: OTHER_ACCESS_SECRET }),
    ],
    ["期限切れ", () => sign({ sub: userId, role: "user" }, { expiresIn: -1 })],
    ["sub不正", () => sign({ sub: "not-a-uuid", role: "user" })],
    ["role不正", () => sign({ sub: userId, role: "owner" })],
  ])("%sを共通401にし、tokenや秘密鍵を応答へ含めない", async (_label, createToken) => {
    const token = await createToken();
    const response = await request(app.getHttpServer())
      .get("/api/v1/test/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(TEST_ACCESS_SECRET);
  });

  it("adminはadmin用ルートへアクセスできる", async () => {
    const token = await sign({ sub: adminId, role: "admin" });

    await request(app.getHttpServer())
      .get("/api/v1/test/auth/admin")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { id: adminId, role: "admin" });
  });

  it("userのadmin用ルートアクセスをRFC 9457形式の403にする", async () => {
    const token = await sign({ sub: userId, role: "user" });
    const response = await request(app.getHttpServer())
      .get("/api/v1/test/auth/admin")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(problemDetailsSchema.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(TEST_ACCESS_SECRET);
  });

  it("Guardを適用していない公開ルートは認証なしで利用できる", async () => {
    await request(app.getHttpServer()).get("/api/v1/test/public").expect(200, { status: "ok" });
  });
});
