import { Module } from "@nestjs/common";
import { MasterController } from "./master.controller";
import { PokemonSearchService } from "./pokemon-search.service";

@Module({
  controllers: [MasterController],
  providers: [PokemonSearchService],
})
export class MasterModule {}
