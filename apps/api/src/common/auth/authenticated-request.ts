import type { AuthenticatedUser } from "@pokemon-champions/shared";
import type { Request } from "express";

/** JwtAuthGuardによる検証後のHTTP request。 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
