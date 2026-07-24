import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@pokemon-champions/shared";
import { createForbiddenException, createUnauthorizedException } from "./auth-errors";
import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly UserRole[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw createUnauthorizedException();
    }
    if (!requiredRoles.includes(request.user.role)) {
      throw createForbiddenException();
    }

    return true;
  }
}
