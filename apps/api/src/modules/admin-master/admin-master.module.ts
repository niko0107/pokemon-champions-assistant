import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminMasterController } from "./admin-master.controller";
import { AdminMasterService } from "./admin-master.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminMasterController],
  providers: [AdminMasterService],
  exports: [AdminMasterService],
})
export class AdminMasterModule {}
