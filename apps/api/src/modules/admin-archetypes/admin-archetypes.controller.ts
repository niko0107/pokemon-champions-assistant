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
  adminArchetypeDetailSchema,
  adminArchetypeIdParamsSchema,
  adminArchetypeListResponseSchema,
  adminArchetypePopularitySchema,
  adminArchetypePopularityUpdateSchema,
  adminArchetypePreviewRequestSchema,
  adminArchetypePreviewResponseSchema,
  adminArchetypeWriteSchema,
  type AdminArchetypeDetail,
  type AdminArchetypeIdParams,
  type AdminArchetypeListResponse,
  type AdminArchetypePopularity,
  type AdminArchetypePopularityUpdate,
  type AdminArchetypePreviewRequest,
  type AdminArchetypePreviewResponse,
  type AdminArchetypeWrite,
} from "@pokemon-champions/shared";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { Roles } from "../../common/auth/roles.decorator";
import { RolesGuard } from "../../common/auth/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminArchetypesService } from "./admin-archetypes.service";

@Controller("admin/archetypes")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminArchetypesController {
  constructor(private readonly archetypes: AdminArchetypesService) {}

  @Get()
  async list(): Promise<AdminArchetypeListResponse> {
    const items = await this.archetypes.list();
    return adminArchetypeListResponseSchema.parse({ items });
  }

  @Get(":id")
  async get(
    @Param(new ZodValidationPipe(adminArchetypeIdParamsSchema)) params: AdminArchetypeIdParams,
  ): Promise<AdminArchetypeDetail> {
    return adminArchetypeDetailSchema.parse(await this.archetypes.get(params.id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(adminArchetypeWriteSchema)) input: AdminArchetypeWrite,
  ): Promise<AdminArchetypeDetail> {
    return adminArchetypeDetailSchema.parse(await this.archetypes.create(input));
  }

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body(new ZodValidationPipe(adminArchetypePreviewRequestSchema))
    input: AdminArchetypePreviewRequest,
  ): Promise<AdminArchetypePreviewResponse> {
    return adminArchetypePreviewResponseSchema.parse(await this.archetypes.preview(input));
  }

  @Put(":id")
  async update(
    @Param(new ZodValidationPipe(adminArchetypeIdParamsSchema)) params: AdminArchetypeIdParams,
    @Body(new ZodValidationPipe(adminArchetypeWriteSchema)) input: AdminArchetypeWrite,
  ): Promise<AdminArchetypeDetail> {
    return adminArchetypeDetailSchema.parse(await this.archetypes.update(params.id, input));
  }

  @Put(":id/popularity")
  async updatePopularity(
    @Param(new ZodValidationPipe(adminArchetypeIdParamsSchema)) params: AdminArchetypeIdParams,
    @Body(new ZodValidationPipe(adminArchetypePopularityUpdateSchema))
    input: AdminArchetypePopularityUpdate,
  ): Promise<AdminArchetypePopularity> {
    return adminArchetypePopularitySchema.parse(
      await this.archetypes.updatePopularity(params.id, input),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param(new ZodValidationPipe(adminArchetypeIdParamsSchema)) params: AdminArchetypeIdParams,
  ): Promise<void> {
    await this.archetypes.archive(params.id);
  }
}
