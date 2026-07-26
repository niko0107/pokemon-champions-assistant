import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  abilitySearchQuerySchema,
  abilitySearchResponseSchema,
  itemSearchQuerySchema,
  itemSearchResponseSchema,
  masterRulesResponseSchema,
  masterPokemonDetailSchema,
  masterPokemonIdParamsSchema,
  moveSearchQuerySchema,
  moveSearchResponseSchema,
  pokemonSearchQuerySchema,
  pokemonSearchResponseSchema,
  type AbilitySearchQuery,
  type AbilitySearchResponse,
  type ItemSearchQuery,
  type ItemSearchResponse,
  type MasterRulesResponse,
  type MasterPokemonDetail,
  type MasterPokemonIdParams,
  type MoveSearchQuery,
  type MoveSearchResponse,
  type PokemonSearchQuery,
  type PokemonSearchResponse,
} from "@pokemon-champions/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AbilitySearchService } from "./ability-search.service";
import { ItemSearchService } from "./item-search.service";
import { MoveSearchService } from "./move-search.service";
import { PokemonSearchService } from "./pokemon-search.service";
import { PokemonDetailService } from "./pokemon-detail.service";
import { RuleCatalogService } from "./rule-catalog.service";

@Controller("master")
export class MasterController {
  constructor(
    private readonly pokemonSearch: PokemonSearchService,
    private readonly moveSearch: MoveSearchService,
    private readonly itemSearch: ItemSearchService,
    private readonly abilitySearch: AbilitySearchService,
    private readonly ruleCatalog: RuleCatalogService,
    private readonly pokemonDetail: PokemonDetailService,
  ) {}

  @Get("pokemons")
  async searchPokemons(
    @Query(new ZodValidationPipe(pokemonSearchQuerySchema)) query: PokemonSearchQuery,
  ): Promise<PokemonSearchResponse> {
    const items = await this.pokemonSearch.search(query);
    // API 入出力は zod で検証する(開発ルール)。出力側も共有スキーマを通す。
    return pokemonSearchResponseSchema.parse({ items });
  }

  @Get("pokemons/:id")
  async getPokemon(
    @Param(new ZodValidationPipe(masterPokemonIdParamsSchema)) params: MasterPokemonIdParams,
  ): Promise<MasterPokemonDetail> {
    return masterPokemonDetailSchema.parse(await this.pokemonDetail.get(params.id));
  }

  @Get("moves")
  async searchMoves(
    @Query(new ZodValidationPipe(moveSearchQuerySchema)) query: MoveSearchQuery,
  ): Promise<MoveSearchResponse> {
    const items = await this.moveSearch.search(query);
    return moveSearchResponseSchema.parse({ items });
  }

  @Get("items")
  async searchItems(
    @Query(new ZodValidationPipe(itemSearchQuerySchema)) query: ItemSearchQuery,
  ): Promise<ItemSearchResponse> {
    const items = await this.itemSearch.search(query);
    return itemSearchResponseSchema.parse({ items });
  }

  @Get("abilities")
  async searchAbilities(
    @Query(new ZodValidationPipe(abilitySearchQuerySchema)) query: AbilitySearchQuery,
  ): Promise<AbilitySearchResponse> {
    const items = await this.abilitySearch.search(query);
    return abilitySearchResponseSchema.parse({ items });
  }

  @Get("rules")
  async listRules(): Promise<MasterRulesResponse> {
    const items = await this.ruleCatalog.list();
    return masterRulesResponseSchema.parse({ items });
  }
}
