import { Controller, Get, Query } from "@nestjs/common";
import {
  pokemonSearchQuerySchema,
  pokemonSearchResponseSchema,
  type PokemonSearchQuery,
  type PokemonSearchResponse,
} from "@pokemon-champions/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PokemonSearchService } from "./pokemon-search.service";

@Controller("master")
export class MasterController {
  constructor(private readonly pokemonSearch: PokemonSearchService) {}

  @Get("pokemons")
  async searchPokemons(
    @Query(new ZodValidationPipe(pokemonSearchQuerySchema)) query: PokemonSearchQuery,
  ): Promise<PokemonSearchResponse> {
    const items = await this.pokemonSearch.search(query);
    // API 入出力は zod で検証する(開発ルール)。出力側も共有スキーマを通す。
    return pokemonSearchResponseSchema.parse({ items });
  }
}
