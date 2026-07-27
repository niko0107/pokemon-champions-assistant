import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  archetypeDetailParamsSchema,
  publicArchetypeDetailSchema,
  type ArchetypeDetailParams,
  type PublicArchetypeDetail,
} from "@pokemon-champions/shared";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ArchetypesService } from "./archetypes.service";

@Controller("archetypes")
@UseGuards(JwtAuthGuard)
export class ArchetypesController {
  constructor(private readonly archetypes: ArchetypesService) {}

  @Get(":id")
  async get(
    @Param(new ZodValidationPipe(archetypeDetailParamsSchema)) params: ArchetypeDetailParams,
  ): Promise<PublicArchetypeDetail> {
    return publicArchetypeDetailSchema.parse(await this.archetypes.get(params.id));
  }
}
