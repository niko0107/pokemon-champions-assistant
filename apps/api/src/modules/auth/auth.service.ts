import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@pokemon-champions/database";
import {
  AUTH_ACCESS_TOKEN_TYPE,
  AUTH_REFRESH_TOKEN_BYTES,
  authResponseSchema,
  type AuthResponse,
  type LoginRequest,
  type ProblemDetails,
  type RefreshRequest,
  type RegisterRequest,
  userSchema,
} from "@pokemon-champions/shared";
import { compare, hash } from "bcrypt";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export const BCRYPT_COST_FACTOR = 12;
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const loginUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

type PublicUserRecord = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

interface AuthTokenSettings {
  accessSecret: string;
  accessExpiresIn: number;
  refreshSecret: string;
  refreshExpiresIn: number;
}

type RefreshTokenClient = Pick<Prisma.TransactionClient, "refreshToken">;

function parseTokenTtl(value: string | undefined, defaultSeconds: number): number | undefined {
  if (value === undefined || value === "") {
    return defaultSeconds;
  }

  const match = /^([1-9]\d*)([smhd])$/u.exec(value);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  const seconds = amount * multiplier;

  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes("email") : target === "email";
}

@Injectable()
export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const tokenSettings = this.getAuthTokenSettings();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      this.throwEmailConflict();
    }

    const passwordHash = await hash(input.password, BCRYPT_COST_FACTOR);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            role: "user",
          },
          select: publicUserSelect,
        });

        return this.issueTokenPair(transaction, user, tokenSettings, randomUUID());
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        this.throwEmailConflict();
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const tokenSettings = this.getAuthTokenSettings();
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: loginUserSelect,
    });
    const passwordHash = user?.passwordHash ?? (await this.getDummyPasswordHash());
    const passwordMatches = await compare(input.password, passwordHash);

    if (!user || !user.passwordHash || !passwordMatches) {
      this.throwInvalidCredentials();
    }

    return this.issueTokenPair(this.prisma, user, tokenSettings, randomUUID());
  }

  async refresh(input: RefreshRequest): Promise<AuthResponse> {
    const tokenSettings = this.getAuthTokenSettings();
    const tokenHash = this.hashRefreshToken(input.refreshToken, tokenSettings.refreshSecret);
    const now = new Date();
    const response = await this.prisma.$transaction(async (transaction) => {
      const storedToken = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
          user: { select: publicUserSelect },
        },
      });

      if (!storedToken) {
        return null;
      }

      if (storedToken.revokedAt) {
        await this.revokeTokenFamily(transaction, storedToken.familyId, new Date());
        return null;
      }

      if (storedToken.expiresAt <= now) {
        await transaction.refreshToken.updateMany({
          where: { id: storedToken.id, revokedAt: null },
          data: { revokedAt: now },
        });
        return null;
      }

      const consumed = await transaction.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (consumed.count !== 1) {
        await this.revokeTokenFamily(transaction, storedToken.familyId, new Date());
        return null;
      }

      return this.issueTokenPair(
        transaction,
        storedToken.user,
        tokenSettings,
        storedToken.familyId,
      );
    });

    if (!response) {
      this.throwInvalidRefreshToken();
    }

    return response;
  }

  private async issueTokenPair(
    tokenClient: RefreshTokenClient,
    user: PublicUserRecord,
    settings: AuthTokenSettings,
    familyId: string,
  ): Promise<AuthResponse> {
    const publicUser = userSchema.parse({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
    const accessToken = await this.jwt.signAsync(
      { sub: publicUser.id, role: publicUser.role },
      {
        algorithm: "HS256",
        secret: settings.accessSecret,
        expiresIn: settings.accessExpiresIn,
      },
    );
    const refreshToken = randomBytes(AUTH_REFRESH_TOKEN_BYTES).toString("base64url");
    const tokenHash = this.hashRefreshToken(refreshToken, settings.refreshSecret);
    const refreshExpiresAt = new Date(Date.now() + settings.refreshExpiresIn * 1_000);

    await tokenClient.refreshToken.create({
      data: {
        userId: publicUser.id,
        tokenHash,
        familyId,
        expiresAt: refreshExpiresAt,
      },
      select: { id: true },
    });

    return authResponseSchema.parse({
      accessToken,
      tokenType: AUTH_ACCESS_TOKEN_TYPE,
      expiresIn: settings.accessExpiresIn,
      refreshToken,
      refreshExpiresIn: settings.refreshExpiresIn,
      user: publicUser,
    });
  }

  private getAuthTokenSettings(): AuthTokenSettings {
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const accessExpiresIn = parseTokenTtl(
      process.env.JWT_ACCESS_EXPIRES_IN,
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    );
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    const refreshExpiresIn = parseTokenTtl(
      process.env.JWT_REFRESH_EXPIRES_IN,
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );

    if (
      !accessSecret ||
      Buffer.byteLength(accessSecret, "utf8") < 32 ||
      accessExpiresIn === undefined ||
      !refreshSecret ||
      Buffer.byteLength(refreshSecret, "utf8") < 32 ||
      refreshExpiresIn === undefined
    ) {
      const problem: ProblemDetails = {
        type: "about:blank",
        title: "Authentication Service Unavailable",
        status: 500,
        code: "INTERNAL_ERROR",
      };
      throw new InternalServerErrorException(problem);
    }

    return { accessSecret, accessExpiresIn, refreshSecret, refreshExpiresIn };
  }

  private hashRefreshToken(token: string, secret: string): string {
    return createHmac("sha256", secret).update(token, "utf8").digest("hex");
  }

  private async revokeTokenFamily(
    transaction: Prisma.TransactionClient,
    familyId: string,
    revokedAt: Date,
  ): Promise<void> {
    await transaction.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= hash(randomBytes(32).toString("hex"), BCRYPT_COST_FACTOR);
    return this.dummyPasswordHash;
  }

  private throwEmailConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Email Already Registered",
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
    };
    throw new ConflictException(problem);
  }

  private throwInvalidCredentials(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Credentials",
      status: 401,
      code: "INVALID_CREDENTIALS",
    };
    throw new UnauthorizedException(problem);
  }

  private throwInvalidRefreshToken(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Refresh Token",
      status: 401,
      code: "INVALID_REFRESH_TOKEN",
    };
    throw new UnauthorizedException(problem);
  }
}
