import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  BATTLE_SESSION_ARCHIVE_CONFIG,
  type BattleSessionArchiveConfig,
} from "./battle-session-archive.config";
import {
  BattleSessionArchiveService,
  type BattleSessionArchiveResult,
} from "./battle-session-archive.service";

@Injectable()
export class BattleSessionArchiveScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BattleSessionArchiveScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly archiveService: BattleSessionArchiveService,
    @Inject(BATTLE_SESSION_ARCHIVE_CONFIG)
    private readonly config: BattleSessionArchiveConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.config.intervalSeconds * 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<BattleSessionArchiveResult | null> {
    if (this.running) {
      return null;
    }

    this.running = true;
    this.logger.log("Battle session archive job started.");

    try {
      const result = await this.archiveService.archiveExpiredSessions();
      this.logger.log(`Battle session archive job completed. count=${result.count}`);
      return result;
    } catch {
      this.logger.error("Battle session archive job failed.");
      return null;
    } finally {
      this.running = false;
    }
  }
}
