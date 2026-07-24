import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  partyDetailSchema,
  partyIdParamsSchema,
  partyListResponseSchema,
  partyWriteSchema,
  type AuthenticatedUser,
  type PartyDetail,
  type PartyIdParams,
  type PartyListResponse,
  type PartyWrite,
} from "@pokemon-champions/shared";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PartiesService } from "./parties.service";

@Controller("parties")
@UseGuards(JwtAuthGuard)
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<PartyListResponse> {
    const items = await this.parties.list(user.id);
    return partyListResponseSchema.parse({ items });
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(partyIdParamsSchema)) params: PartyIdParams,
  ): Promise<PartyDetail> {
    return partyDetailSchema.parse(await this.parties.get(user.id, params.id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(partyWriteSchema)) input: PartyWrite,
  ): Promise<PartyDetail> {
    return partyDetailSchema.parse(await this.parties.create(user.id, input));
  }

  @Put(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(partyIdParamsSchema)) params: PartyIdParams,
    @Body(new ZodValidationPipe(partyWriteSchema)) input: PartyWrite,
  ): Promise<PartyDetail> {
    return partyDetailSchema.parse(await this.parties.update(user.id, params.id, input));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(partyIdParamsSchema)) params: PartyIdParams,
  ): Promise<void> {
    await this.parties.remove(user.id, params.id);
  }
}
