import { Module } from "@nestjs/common";
import { AbilitySearchService } from "./ability-search.service";
import { ItemSearchService } from "./item-search.service";
import { MasterController } from "./master.controller";
import { MoveSearchService } from "./move-search.service";
import { PokemonSearchService } from "./pokemon-search.service";

@Module({
  controllers: [MasterController],
  providers: [PokemonSearchService, MoveSearchService, ItemSearchService, AbilitySearchService],
})
export class MasterModule {}
