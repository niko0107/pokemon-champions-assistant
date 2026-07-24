import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@pokemon-champions/shared";

export const REQUIRED_ROLES_KEY = "requiredRoles";

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
