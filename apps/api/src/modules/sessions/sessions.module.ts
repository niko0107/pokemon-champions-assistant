import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BattleCandidatesCache } from "./session-candidates-cache";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [BattleCandidatesCache, SessionsService],
})
export class SessionsModule {}
