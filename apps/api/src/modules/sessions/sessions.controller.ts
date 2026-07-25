import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  battleSessionCreateSchema,
  battleSessionIdParamsSchema,
  battleSessionResponseSchema,
  observationCreateSchema,
  observationResponseSchema,
  undoObservationParamsSchema,
  undoObservationResponseSchema,
  type AuthenticatedUser,
  type BattleSessionCreate,
  type BattleSessionIdParams,
  type BattleSessionResponse,
  type ObservationCreate,
  type ObservationResponse,
  type UndoObservationParams,
  type UndoObservationResponse,
} from "@pokemon-champions/shared";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(battleSessionCreateSchema)) input: BattleSessionCreate,
  ): Promise<BattleSessionResponse> {
    return battleSessionResponseSchema.parse(await this.sessions.create(user.id, input));
  }

  @Post(":id/observations")
  @HttpCode(HttpStatus.CREATED)
  async addObservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
    @Body(new ZodValidationPipe(observationCreateSchema)) input: ObservationCreate,
  ): Promise<ObservationResponse> {
    return observationResponseSchema.parse(
      await this.sessions.addObservation(user.id, params.id, input),
    );
  }

  @Delete(":id/observations/:obsId")
  async undoObservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(undoObservationParamsSchema)) params: UndoObservationParams,
  ): Promise<UndoObservationResponse> {
    return undoObservationResponseSchema.parse(
      await this.sessions.undoObservation(user.id, params.id, params.obsId),
    );
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
  ): Promise<BattleSessionResponse> {
    return battleSessionResponseSchema.parse(await this.sessions.get(user.id, params.id));
  }
}
