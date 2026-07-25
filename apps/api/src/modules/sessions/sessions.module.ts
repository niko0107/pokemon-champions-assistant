import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  BATTLE_SESSION_ARCHIVE_CONFIG,
  resolveBattleSessionArchiveConfig,
} from "./battle-session-archive.config";
import { BattleSessionArchiveScheduler } from "./battle-session-archive.scheduler";
import { BattleSessionArchiveService } from "./battle-session-archive.service";
import { BATTLE_RATE_LIMIT_CONFIG, resolveBattleRateLimitConfig } from "./battle-rate-limit.config";
import { BattleRateLimitGuard } from "./battle-rate-limit.guard";
import { BattleRateLimitService } from "./battle-rate-limit.service";
import { BattleCandidatesCache } from "./session-candidates-cache";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [
    {
      provide: BATTLE_SESSION_ARCHIVE_CONFIG,
      useFactory: () =>
        resolveBattleSessionArchiveConfig(
          process.env.BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS,
          process.env.BATTLE_ENDED_ARCHIVE_AFTER_SECONDS,
          process.env.BATTLE_ARCHIVE_INTERVAL_SECONDS,
        ),
    },
    {
      provide: BATTLE_RATE_LIMIT_CONFIG,
      useFactory: () =>
        resolveBattleRateLimitConfig(
          process.env.BATTLE_RATE_LIMIT,
          process.env.BATTLE_RATE_LIMIT_WINDOW_SECONDS,
        ),
    },
    BattleSessionArchiveScheduler,
    BattleSessionArchiveService,
    BattleCandidatesCache,
    BattleRateLimitGuard,
    BattleRateLimitService,
    SessionsService,
  ],
})
export class SessionsModule {}
