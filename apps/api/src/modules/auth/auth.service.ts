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
  authResponseSchema,
  type AuthResponse,
  type LoginRequest,
  type ProblemDetails,
  type RegisterRequest,
  userSchema,
} from "@pokemon-champions/shared";
import { compare, hash } from "bcrypt";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export const BCRYPT_COST_FACTOR = 12;
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

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

interface AccessTokenSettings {
  secret: string;
  expiresIn: number;
}

function parseAccessTokenTtl(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
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
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const tokenSettings = this.getAccessTokenSettings();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      this.throwEmailConflict();
    }

    const passwordHash = await hash(input.password, BCRYPT_COST_FACTOR);
    let user: PublicUserRecord;

    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          role: "user",
        },
        select: publicUserSelect,
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        this.throwEmailConflict();
      }
      throw error;
    }

    return this.issueAccessToken(user, tokenSettings);
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const tokenSettings = this.getAccessTokenSettings();
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: loginUserSelect,
    });
    const passwordHash = user?.passwordHash ?? (await this.getDummyPasswordHash());
    const passwordMatches = await compare(input.password, passwordHash);

    if (!user || !user.passwordHash || !passwordMatches) {
      this.throwInvalidCredentials();
    }

    return this.issueAccessToken(user, tokenSettings);
  }

  private async issueAccessToken(
    user: PublicUserRecord,
    settings: AccessTokenSettings,
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
        secret: settings.secret,
        expiresIn: settings.expiresIn,
      },
    );

    return authResponseSchema.parse({
      accessToken,
      tokenType: AUTH_ACCESS_TOKEN_TYPE,
      expiresIn: settings.expiresIn,
      user: publicUser,
    });
  }

  private getAccessTokenSettings(): AccessTokenSettings {
    const secret = process.env.JWT_ACCESS_SECRET;
    const expiresIn = parseAccessTokenTtl(process.env.JWT_ACCESS_EXPIRES_IN);

    if (!secret || Buffer.byteLength(secret, "utf8") < 32 || expiresIn === undefined) {
      const problem: ProblemDetails = {
        type: "about:blank",
        title: "Authentication Service Unavailable",
        status: 500,
        code: "INTERNAL_ERROR",
      };
      throw new InternalServerErrorException(problem);
    }

    return { secret, expiresIn };
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
}
