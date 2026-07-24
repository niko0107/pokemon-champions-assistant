import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ProblemDetails } from "@pokemon-champions/shared";

export function createUnauthorizedException(): UnauthorizedException {
  const problem: ProblemDetails = {
    type: "about:blank",
    title: "Unauthorized",
    status: 401,
    code: "UNAUTHORIZED",
  };

  return new UnauthorizedException(problem);
}

export function createForbiddenException(): ForbiddenException {
  const problem: ProblemDetails = {
    type: "about:blank",
    title: "Forbidden",
    status: 403,
    code: "FORBIDDEN",
  };

  return new ForbiddenException(problem);
}

export function createAuthenticationUnavailableException(): InternalServerErrorException {
  const problem: ProblemDetails = {
    type: "about:blank",
    title: "Authentication Service Unavailable",
    status: 500,
    code: "INTERNAL_ERROR",
  };

  return new InternalServerErrorException(problem);
}
