import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  accessTokenPayloadSchema,
  authenticatedUserSchema,
} from "@pokemon-champions/shared";
import {
  createAuthenticationUnavailableException,
  createUnauthorizedException,
} from "./auth-errors";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const secret = this.getAccessTokenSecret();

    try {
      const rawPayload: unknown = await this.jwt.verifyAsync(token, {
        algorithms: ["HS256"],
        secret,
      });
      const payload = accessTokenPayloadSchema.parse(rawPayload);
      request.user = authenticatedUserSchema.parse({
        id: payload.sub,
        role: payload.role,
      });
    } catch {
      throw createUnauthorizedException();
    }

    return true;
  }

  private extractBearerToken(authorization: string | undefined): string {
    const match = /^Bearer ([^\s]+)$/iu.exec(authorization ?? "");
    if (!match?.[1]) {
      throw createUnauthorizedException();
    }

    return match[1];
  }

  private getAccessTokenSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw createAuthenticationUnavailableException();
    }

    return secret;
  }
}
