import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  BATTLE_SESSION_ARCHIVE_CONFIG,
  type BattleSessionArchiveConfig,
} from "./battle-session-archive.config";

export interface BattleSessionArchiveResult {
  count: number;
}

@Injectable()
export class BattleSessionArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BATTLE_SESSION_ARCHIVE_CONFIG)
    private readonly config: BattleSessionArchiveConfig,
  ) {}

  async archiveExpiredSessions(now = new Date()): Promise<BattleSessionArchiveResult> {
    const activeCutoff = new Date(now.getTime() - this.config.activeArchiveAfterSeconds * 1_000);
    const endedCutoff = new Date(now.getTime() - this.config.endedArchiveAfterSeconds * 1_000);

    const result = await this.prisma.battleSession.updateMany({
      where: {
        OR: [
          {
            status: "active",
            updatedAt: { lt: activeCutoff },
          },
          {
            status: "ended",
            endedAt: { not: null, lt: endedCutoff },
          },
        ],
      },
      data: { status: "archived" },
    });

    return { count: result.count };
  }
}
