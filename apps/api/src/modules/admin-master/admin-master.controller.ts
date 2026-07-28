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
  adminAbilityListResponseSchema,
  adminAbilitySchema,
  adminAbilityWriteSchema,
  adminItemListResponseSchema,
  adminItemSchema,
  adminItemWriteSchema,
  adminMasterIdParamsSchema,
  adminMoveListResponseSchema,
  adminMoveSchema,
  adminMoveWriteSchema,
  adminPokemonListResponseSchema,
  adminPokemonMovesResponseSchema,
  adminPokemonMovesWriteSchema,
  adminPokemonSchema,
  adminPokemonWriteSchema,
  type AdminAbility,
  type AdminAbilityListResponse,
  type AdminAbilityWrite,
  type AdminItem,
  type AdminItemListResponse,
  type AdminItemWrite,
  type AdminMasterIdParams,
  type AdminMove,
  type AdminMoveListResponse,
  type AdminMoveWrite,
  type AdminPokemon,
  type AdminPokemonListResponse,
  type AdminPokemonMovesResponse,
  type AdminPokemonMovesWrite,
  type AdminPokemonWrite,
} from "@pokemon-champions/shared";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { Roles } from "../../common/auth/roles.decorator";
import { RolesGuard } from "../../common/auth/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminMasterService } from "./admin-master.service";

@Controller("admin/master")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminMasterController {
  constructor(private readonly master: AdminMasterService) {}

  @Get("pokemons")
  async listPokemons(): Promise<AdminPokemonListResponse> {
    return adminPokemonListResponseSchema.parse({ items: await this.master.listPokemons() });
  }

  @Get("pokemons/:id")
  async getPokemon(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<AdminPokemon> {
    return adminPokemonSchema.parse(await this.master.getPokemon(params.id));
  }

  @Post("pokemons")
  @HttpCode(HttpStatus.CREATED)
  async createPokemon(
    @Body(new ZodValidationPipe(adminPokemonWriteSchema)) input: AdminPokemonWrite,
  ): Promise<AdminPokemon> {
    return adminPokemonSchema.parse(await this.master.createPokemon(input));
  }

  @Put("pokemons/:id")
  async updatePokemon(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
    @Body(new ZodValidationPipe(adminPokemonWriteSchema)) input: AdminPokemonWrite,
  ): Promise<AdminPokemon> {
    return adminPokemonSchema.parse(await this.master.updatePokemon(params.id, input));
  }

  @Delete("pokemons/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePokemon(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<void> {
    await this.master.deletePokemon(params.id);
  }

  @Get("pokemons/:id/moves")
  async listPokemonMoves(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<AdminPokemonMovesResponse> {
    return adminPokemonMovesResponseSchema.parse(await this.master.listPokemonMoves(params.id));
  }

  @Put("pokemons/:id/moves")
  async replacePokemonMoves(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
    @Body(new ZodValidationPipe(adminPokemonMovesWriteSchema)) input: AdminPokemonMovesWrite,
  ): Promise<AdminPokemonMovesResponse> {
    return adminPokemonMovesResponseSchema.parse(
      await this.master.replacePokemonMoves(params.id, input),
    );
  }

  @Get("moves")
  async listMoves(): Promise<AdminMoveListResponse> {
    return adminMoveListResponseSchema.parse({ items: await this.master.listMoves() });
  }

  @Get("moves/:id")
  async getMove(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<AdminMove> {
    return adminMoveSchema.parse(await this.master.getMove(params.id));
  }

  @Post("moves")
  @HttpCode(HttpStatus.CREATED)
  async createMove(
    @Body(new ZodValidationPipe(adminMoveWriteSchema)) input: AdminMoveWrite,
  ): Promise<AdminMove> {
    return adminMoveSchema.parse(await this.master.createMove(input));
  }

  @Put("moves/:id")
  async updateMove(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
    @Body(new ZodValidationPipe(adminMoveWriteSchema)) input: AdminMoveWrite,
  ): Promise<AdminMove> {
    return adminMoveSchema.parse(await this.master.updateMove(params.id, input));
  }

  @Delete("moves/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMove(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<void> {
    await this.master.deleteMove(params.id);
  }

  @Get("items")
  async listItems(): Promise<AdminItemListResponse> {
    return adminItemListResponseSchema.parse({ items: await this.master.listItems() });
  }

  @Get("items/:id")
  async getItem(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<AdminItem> {
    return adminItemSchema.parse(await this.master.getItem(params.id));
  }

  @Post("items")
  @HttpCode(HttpStatus.CREATED)
  async createItem(
    @Body(new ZodValidationPipe(adminItemWriteSchema)) input: AdminItemWrite,
  ): Promise<AdminItem> {
    return adminItemSchema.parse(await this.master.createItem(input));
  }

  @Put("items/:id")
  async updateItem(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
    @Body(new ZodValidationPipe(adminItemWriteSchema)) input: AdminItemWrite,
  ): Promise<AdminItem> {
    return adminItemSchema.parse(await this.master.updateItem(params.id, input));
  }

  @Delete("items/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<void> {
    await this.master.deleteItem(params.id);
  }

  @Get("abilities")
  async listAbilities(): Promise<AdminAbilityListResponse> {
    return adminAbilityListResponseSchema.parse({ items: await this.master.listAbilities() });
  }

  @Get("abilities/:id")
  async getAbility(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<AdminAbility> {
    return adminAbilitySchema.parse(await this.master.getAbility(params.id));
  }

  @Post("abilities")
  @HttpCode(HttpStatus.CREATED)
  async createAbility(
    @Body(new ZodValidationPipe(adminAbilityWriteSchema)) input: AdminAbilityWrite,
  ): Promise<AdminAbility> {
    return adminAbilitySchema.parse(await this.master.createAbility(input));
  }

  @Put("abilities/:id")
  async updateAbility(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
    @Body(new ZodValidationPipe(adminAbilityWriteSchema)) input: AdminAbilityWrite,
  ): Promise<AdminAbility> {
    return adminAbilitySchema.parse(await this.master.updateAbility(params.id, input));
  }

  @Delete("abilities/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAbility(
    @Param(new ZodValidationPipe(adminMasterIdParamsSchema)) params: AdminMasterIdParams,
  ): Promise<void> {
    await this.master.deleteAbility(params.id);
  }
}
