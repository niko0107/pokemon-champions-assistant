import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PartiesController } from "./parties.controller";
import { PartiesService } from "./parties.service";

@Module({
  imports: [AuthModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
