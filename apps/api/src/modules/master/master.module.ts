import { Module } from "@nestjs/common";
import { AbilitySearchService } from "./ability-search.service";
import { ItemSearchService } from "./item-search.service";
import { MasterController } from "./master.controller";
import { MoveSearchService } from "./move-search.service";
import { PokemonSearchService } from "./pokemon-search.service";
import { RuleCatalogService } from "./rule-catalog.service";

@Module({
  controllers: [MasterController],
  providers: [
    PokemonSearchService,
    MoveSearchService,
    ItemSearchService,
    AbilitySearchService,
    RuleCatalogService,
  ],
})
export class MasterModule {}
