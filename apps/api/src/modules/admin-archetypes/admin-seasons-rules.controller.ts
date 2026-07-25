import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  adminRuleCreateSchema,
  adminRuleListResponseSchema,
  adminRuleSchema,
  adminSeasonArchiveResponseSchema,
  adminSeasonCreateSchema,
  adminSeasonIdParamsSchema,
  adminSeasonListResponseSchema,
  adminSeasonSchema,
  type AdminRule,
  type AdminRuleCreate,
  type AdminRuleListResponse,
  type AdminSeason,
  type AdminSeasonArchiveResponse,
  type AdminSeasonCreate,
  type AdminSeasonIdParams,
  type AdminSeasonListResponse,
} from "@pokemon-champions/shared";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { Roles } from "../../common/auth/roles.decorator";
import { RolesGuard } from "../../common/auth/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminSeasonsRulesService } from "./admin-seasons-rules.service";

@Controller("admin/seasons")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminSeasonsController {
  constructor(private readonly seasonsRules: AdminSeasonsRulesService) {}

  @Get()
  async list(): Promise<AdminSeasonListResponse> {
    const items = await this.seasonsRules.listSeasons();
    return adminSeasonListResponseSchema.parse({ items });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(adminSeasonCreateSchema)) input: AdminSeasonCreate,
  ): Promise<AdminSeason> {
    return adminSeasonSchema.parse(await this.seasonsRules.createSeason(input));
  }

  @Post(":id/archive-archetypes")
  @HttpCode(HttpStatus.OK)
  async archiveArchetypes(
    @Param(new ZodValidationPipe(adminSeasonIdParamsSchema)) params: AdminSeasonIdParams,
  ): Promise<AdminSeasonArchiveResponse> {
    return adminSeasonArchiveResponseSchema.parse(
      await this.seasonsRules.archiveArchetypesBySeason(params.id),
    );
  }
}

@Controller("admin/rules")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminRulesController {
  constructor(private readonly seasonsRules: AdminSeasonsRulesService) {}

  @Get()
  async list(): Promise<AdminRuleListResponse> {
    const items = await this.seasonsRules.listRules();
    return adminRuleListResponseSchema.parse({ items });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(adminRuleCreateSchema)) input: AdminRuleCreate,
  ): Promise<AdminRule> {
    return adminRuleSchema.parse(await this.seasonsRules.createRule(input));
  }
}
