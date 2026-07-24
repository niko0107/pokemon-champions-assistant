import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminArchetypesController } from "./admin-archetypes.controller";
import { AdminArchetypesService } from "./admin-archetypes.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminArchetypesController],
  providers: [AdminArchetypesService],
  exports: [AdminArchetypesService],
})
export class AdminArchetypesModule {}
