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
  battleCandidateSelectResponseSchema,
  battleCandidateSelectSchema,
  battleCandidatesResponseSchema,
  battleSessionCreateSchema,
  battleSessionEndResponseSchema,
  battleSessionEndSchema,
  battleSessionIdParamsSchema,
  battleSessionResponseSchema,
  sessionCounterplanParamsSchema,
  sessionCounterplanResponseSchema,
  observationCreateSchema,
  observationResponseSchema,
  undoObservationParamsSchema,
  undoObservationResponseSchema,
  type AuthenticatedUser,
  type BattleCandidateSelect,
  type BattleCandidateSelectResponse,
  type BattleCandidatesResponse,
  type BattleSessionCreate,
  type BattleSessionEnd,
  type BattleSessionEndResponse,
  type BattleSessionIdParams,
  type BattleSessionResponse,
  type ObservationCreate,
  type ObservationResponse,
  type SessionCounterplanParams,
  type SessionCounterplanResponse,
  type UndoObservationParams,
  type UndoObservationResponse,
} from "@pokemon-champions/shared";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { BattleRateLimitGuard } from "./battle-rate-limit.guard";
import { SessionCounterplanService } from "./session-counterplan.service";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly counterplans: SessionCounterplanService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(battleSessionCreateSchema)) input: BattleSessionCreate,
  ): Promise<BattleSessionResponse> {
    return battleSessionResponseSchema.parse(await this.sessions.create(user.id, input));
  }

  @Post(":id/observations")
  @UseGuards(BattleRateLimitGuard)
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

  @Get(":id/candidates")
  async getCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
  ): Promise<BattleCandidatesResponse> {
    return battleCandidatesResponseSchema.parse(
      await this.sessions.getCandidates(user.id, params.id),
    );
  }

  @Get(":id/counterplan")
  async getCounterplan(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(sessionCounterplanParamsSchema))
    params: SessionCounterplanParams,
  ): Promise<SessionCounterplanResponse> {
    return sessionCounterplanResponseSchema.parse(await this.counterplans.get(user.id, params.id));
  }

  @Post(":id/select")
  @HttpCode(HttpStatus.OK)
  async selectCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
    @Body(new ZodValidationPipe(battleCandidateSelectSchema)) input: BattleCandidateSelect,
  ): Promise<BattleCandidateSelectResponse> {
    return battleCandidateSelectResponseSchema.parse(
      await this.sessions.selectCandidate(user.id, params.id, input),
    );
  }

  @Post(":id/end")
  @HttpCode(HttpStatus.OK)
  async end(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
    @Body(new ZodValidationPipe(battleSessionEndSchema)) input: BattleSessionEnd,
  ): Promise<BattleSessionEndResponse> {
    return battleSessionEndResponseSchema.parse(await this.sessions.end(user.id, params.id, input));
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(battleSessionIdParamsSchema)) params: BattleSessionIdParams,
  ): Promise<BattleSessionResponse> {
    return battleSessionResponseSchema.parse(await this.sessions.get(user.id, params.id));
  }
}
