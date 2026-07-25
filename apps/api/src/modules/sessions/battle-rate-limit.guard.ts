import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { authenticatedUserSchema, type ProblemDetails } from "@pokemon-champions/shared";
import type { Response } from "express";
import { createUnauthorizedException } from "../../common/auth/auth-errors";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { BattleRateLimitService } from "./battle-rate-limit.service";

@Injectable()
export class BattleRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: BattleRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const authenticatedUser = authenticatedUserSchema.safeParse(request.user);
    if (!authenticatedUser.success) {
      throw createUnauthorizedException();
    }

    const decision = await this.rateLimit.consumeObservation(authenticatedUser.data.id);
    if (decision.allowed) {
      return true;
    }

    response.setHeader("Retry-After", String(decision.retryAfterSeconds));
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Too Many Requests",
      status: HttpStatus.TOO_MANY_REQUESTS,
      detail: "Observation request rate limit exceeded.",
      instance: request.originalUrl,
      code: "RATE_LIMITED",
    };
    throw new HttpException(problem, HttpStatus.TOO_MANY_REQUESTS);
  }
}
