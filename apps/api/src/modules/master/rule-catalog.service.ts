import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import { masterRuleSchema, type MasterRule, type ProblemDetails } from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const masterRuleSelect = {
  id: true,
  name: true,
  teamSize: true,
  pickSize: true,
} satisfies Prisma.RuleSelect;

@Injectable()
export class RuleCatalogService {
  private readonly logger = new Logger(RuleCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<MasterRule[]> {
    const records = await this.prisma.rule.findMany({
      select: masterRuleSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const result = masterRuleSchema.array().safeParse(records);

    if (!result.success) {
      this.logger.error("Rule master contains invalid public values");
      const problem: ProblemDetails = {
        type: "about:blank",
        title: "Master Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      };
      throw new InternalServerErrorException(problem);
    }

    return result.data;
  }
}
