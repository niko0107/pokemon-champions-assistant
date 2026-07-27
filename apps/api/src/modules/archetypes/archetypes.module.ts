import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ArchetypesController } from "./archetypes.controller";
import { ArchetypesService } from "./archetypes.service";

@Module({
  imports: [AuthModule],
  controllers: [ArchetypesController],
  providers: [ArchetypesService],
})
export class ArchetypesModule {}
