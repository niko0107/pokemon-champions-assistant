import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  itemSummarySchema,
  MASTER_SEARCH_RESULT_LIMIT,
  type ItemSearchQuery,
  type ItemSummary,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const itemSummarySelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  effectTags: true,
} satisfies Prisma.ItemSelect;

const deterministicOrderBy = [
  { nameJa: "asc" },
  { nameEn: "asc" },
  { id: "asc" },
] satisfies Prisma.ItemOrderByWithRelationInput[];

@Injectable()
export class ItemSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** 日本語名・英語名を前方一致→部分一致の優先順で検索する。 */
  async search(query: ItemSearchQuery): Promise<ItemSummary[]> {
    const prefixWhere = this.buildNameWhere("startsWith", query.q);
    const prefixMatches = await this.prisma.item.findMany({
      where: prefixWhere,
      select: itemSummarySelect,
      orderBy: deterministicOrderBy,
      take: MASTER_SEARCH_RESULT_LIMIT,
    });

    const remaining = MASTER_SEARCH_RESULT_LIMIT - prefixMatches.length;
    if (remaining <= 0) {
      return itemSummarySchema.array().parse(prefixMatches);
    }

    const containsMatches = await this.prisma.item.findMany({
      where: {
        AND: [this.buildNameWhere("contains", query.q), { NOT: prefixWhere }],
      },
      select: itemSummarySelect,
      orderBy: deterministicOrderBy,
      take: remaining,
    });

    return itemSummarySchema.array().parse([...prefixMatches, ...containsMatches]);
  }

  private buildNameWhere(operator: "startsWith" | "contains", q: string): Prisma.ItemWhereInput {
    return {
      OR: [{ nameJa: { [operator]: q } }, { nameEn: { [operator]: q, mode: "insensitive" } }],
    };
  }
}
