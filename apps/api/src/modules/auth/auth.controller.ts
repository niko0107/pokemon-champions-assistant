import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  loginRequestSchema,
  loginResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@pokemon-champions/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) input: RegisterRequest,
  ): Promise<RegisterResponse> {
    return registerResponseSchema.parse(await this.authService.register(input));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
  ): Promise<LoginResponse> {
    return loginResponseSchema.parse(await this.authService.login(input));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) input: RefreshRequest,
  ): Promise<RefreshResponse> {
    return refreshResponseSchema.parse(await this.authService.refresh(input));
  }
}
