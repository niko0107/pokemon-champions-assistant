import { ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@pokemon-champions/database";
import {
  adminRuleSchema,
  adminSeasonArchiveResponseSchema,
  adminSeasonSchema,
  type AdminRule,
  type AdminRuleCreate,
  type AdminSeason,
  type AdminSeasonArchiveResponse,
  type AdminSeasonCreate,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const seasonSelect = {
  id: true,
  name: true,
  startsAt: true,
  endsAt: true,
} satisfies Prisma.SeasonSelect;

const ruleSelect = {
  id: true,
  name: true,
  teamSize: true,
  pickSize: true,
  battleLevel: true,
} satisfies Prisma.RuleSelect;

type SeasonRecord = Prisma.SeasonGetPayload<{ select: typeof seasonSelect }>;
type RuleRecord = Prisma.RuleGetPayload<{ select: typeof ruleSelect }>;

/** @db.Date の DateTime を API の YYYY-MM-DD へ変換する(UTC基準で日付部分のみ)。 */
function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * ARCHETYPE-003 A-03: シーズン・ルール管理(PRODUCT_SPEC §10.2)と、
 * シーズン終了時の一括アーカイブ(§13.2)を担う admin 専用サービス。
 */
@Injectable()
export class AdminSeasonsRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listSeasons(): Promise<AdminSeason[]> {
    const records = await this.prisma.season.findMany({
      select: seasonSelect,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializeSeason(record));
  }

  async createSeason(input: AdminSeasonCreate): Promise<AdminSeason> {
    try {
      const record = await this.prisma.season.create({
        data: {
          name: input.name,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
        select: seasonSelect,
      });
      return this.serializeSeason(record);
    } catch (error: unknown) {
      this.translateUniqueConflict(error, "season");
    }
  }

  async listRules(): Promise<AdminRule[]> {
    const records = await this.prisma.rule.findMany({
      select: ruleSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return records.map((record) => this.serializeRule(record));
  }

  async createRule(input: AdminRuleCreate): Promise<AdminRule> {
    try {
      const record = await this.prisma.rule.create({
        data: {
          name: input.name,
          teamSize: input.teamSize,
          pickSize: input.pickSize,
          battleLevel: input.battleLevel,
        },
        select: ruleSelect,
      });
      return this.serializeRule(record);
    } catch (error: unknown) {
      this.translateUniqueConflict(error, "rule");
    }
  }

  /**
   * 指定シーズンの published 構築を一括で archived にする(シーズン切替)。
   * シーズン存在確認と更新を単一トランザクションに閉じ込め、部分適用を避ける。
   */
  async archiveArchetypesBySeason(seasonId: number): Promise<AdminSeasonArchiveResponse> {
    const archivedCount = await this.prisma.$transaction(async (transaction) => {
      const season = await transaction.season.findUnique({
        where: { id: seasonId },
        select: { id: true },
      });
      if (!season) {
        this.throwSeasonNotFound();
      }

      const result = await transaction.archetype.updateMany({
        where: { seasonId, status: "published" },
        data: { status: "archived" },
      });
      return result.count;
    });

    return adminSeasonArchiveResponseSchema.parse({ seasonId, archivedCount });
  }

  private serializeSeason(record: SeasonRecord): AdminSeason {
    return adminSeasonSchema.parse({
      id: record.id,
      name: record.name,
      startsAt: toCalendarDate(record.startsAt),
      endsAt: toCalendarDate(record.endsAt),
    });
  }

  private serializeRule(record: RuleRecord): AdminRule {
    return adminRuleSchema.parse({
      id: record.id,
      name: record.name,
      teamSize: record.teamSize,
      pickSize: record.pickSize,
      battleLevel: record.battleLevel,
    });
  }

  private translateUniqueConflict(error: unknown, entity: "season" | "rule"): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      entity === "season"
    ) {
      this.throwSeasonConflict();
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      entity === "rule"
    ) {
      this.throwRuleConflict();
    }
    throw error;
  }

  private throwSeasonNotFound(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Season Not Found",
      status: 404,
      code: "NOT_FOUND",
    };
    throw new NotFoundException(problem);
  }

  private throwSeasonConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Season Conflict",
      status: 409,
      code: "SEASON_CONFLICT",
    };
    throw new ConflictException(problem);
  }

  private throwRuleConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Rule Conflict",
      status: 409,
      code: "RULE_CONFLICT",
    };
    throw new ConflictException(problem);
  }
}
