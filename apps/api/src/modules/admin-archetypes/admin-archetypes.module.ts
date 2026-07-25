import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminArchetypesController } from "./admin-archetypes.controller";
import { AdminArchetypesService } from "./admin-archetypes.service";
import { AdminRulesController, AdminSeasonsController } from "./admin-seasons-rules.controller";
import { AdminSeasonsRulesService } from "./admin-seasons-rules.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminArchetypesController, AdminSeasonsController, AdminRulesController],
  providers: [AdminArchetypesService, AdminSeasonsRulesService],
  exports: [AdminArchetypesService, AdminSeasonsRulesService],
})
export class AdminArchetypesModule {}
