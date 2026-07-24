import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { authenticatedUserSchema, type AuthenticatedUser } from "@pokemon-champions/shared";
import { createUnauthorizedException } from "./auth-errors";
import type { AuthenticatedRequest } from "./authenticated-request";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = authenticatedUserSchema.safeParse(request.user);
    if (!result.success) {
      throw createUnauthorizedException();
    }

    return result.data;
  },
);
