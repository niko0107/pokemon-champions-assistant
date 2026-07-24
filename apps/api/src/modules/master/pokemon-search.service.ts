import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  POKEMON_SEARCH_RESULT_LIMIT,
  type PokemonSearchQuery,
  type PokemonSummary,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

/** オートコンプリート表示に必要な列のみ取得する(abilities・種族値は返さない) */
const pokemonSummarySelect = {
  id: true,
  dexNo: true,
  nameJa: true,
  nameEn: true,
  form: true,
  type1: true,
  type2: true,
  isMega: true,
  basePokemonId: true,
} satisfies Prisma.PokemonSelect;

/**
 * 同一マッチ段階内の決定的な並び順:
 * 図鑑番号 → 通常形態優先(isMega asc)→ フォルム名 → id。
 */
const deterministicOrderBy = [
  { dexNo: "asc" },
  { isMega: "asc" },
  { form: "asc" },
  { id: "asc" },
] satisfies Prisma.PokemonOrderByWithRelationInput[];

@Injectable()
export class PokemonSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 日本語名・英語名・フォルムを対象に、前方一致 → 部分一致の優先順で検索する。
   * 英語名・フォルムは大文字小文字を区別しない。Prisma のクエリビルダのみを使用し、
   * 生 SQL は使わない(検索仕様の判断は docs/DECISIONS.md D-020)。
   */
  async search(query: PokemonSearchQuery): Promise<PokemonSummary[]> {
    const prefixWhere = this.buildNameWhere("startsWith", query.q);

    const prefixMatches = await this.prisma.pokemon.findMany({
      where: prefixWhere,
      select: pokemonSummarySelect,
      orderBy: deterministicOrderBy,
      take: POKEMON_SEARCH_RESULT_LIMIT,
    });

    const remaining = POKEMON_SEARCH_RESULT_LIMIT - prefixMatches.length;
    if (remaining <= 0) {
      return prefixMatches;
    }

    const containsMatches = await this.prisma.pokemon.findMany({
      // 前方一致で拾った行を除いた部分一致のみ(重複防止)
      where: { AND: [this.buildNameWhere("contains", query.q), { NOT: prefixWhere }] },
      select: pokemonSummarySelect,
      orderBy: deterministicOrderBy,
      take: remaining,
    });

    return [...prefixMatches, ...containsMatches];
  }

  private buildNameWhere(
    operator: "startsWith" | "contains",
    q: string,
  ): Prisma.PokemonWhereInput {
    return {
      OR: [
        { nameJa: { [operator]: q } },
        { nameEn: { [operator]: q, mode: "insensitive" } },
        { form: { [operator]: q, mode: "insensitive" } },
      ],
    };
  }
}
