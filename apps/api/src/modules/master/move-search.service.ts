import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  MASTER_SEARCH_RESULT_LIMIT,
  moveSummarySchema,
  type MoveSearchQuery,
  type MoveSummary,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const moveSummarySelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  type: true,
  category: true,
  power: true,
  accuracy: true,
  priority: true,
  tags: true,
} satisfies Prisma.MoveSelect;

const deterministicOrderBy = [
  { nameJa: "asc" },
  { nameEn: "asc" },
  { id: "asc" },
] satisfies Prisma.MoveOrderByWithRelationInput[];

@Injectable()
export class MoveSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * q指定時は前方一致→部分一致、pokemon_id指定時はPokemonMoveに存在する技だけを返す。
   * qなし・pokemon_idのみの場合は習得可能技を決定的な順序で先頭10件返す。
   */
  async search(query: MoveSearchQuery): Promise<MoveSummary[]> {
    const pokemonScope = this.buildPokemonScope(query.pokemon_id);

    if (query.q === undefined) {
      const matches = await this.prisma.move.findMany({
        where: pokemonScope,
        select: moveSummarySelect,
        orderBy: deterministicOrderBy,
        take: MASTER_SEARCH_RESULT_LIMIT,
      });
      return moveSummarySchema.array().parse(matches);
    }

    const prefixNameWhere = this.buildNameWhere("startsWith", query.q);
    const prefixWhere = this.withPokemonScope(prefixNameWhere, pokemonScope);
    const prefixMatches = await this.prisma.move.findMany({
      where: prefixWhere,
      select: moveSummarySelect,
      orderBy: deterministicOrderBy,
      take: MASTER_SEARCH_RESULT_LIMIT,
    });

    const remaining = MASTER_SEARCH_RESULT_LIMIT - prefixMatches.length;
    if (remaining <= 0) {
      return moveSummarySchema.array().parse(prefixMatches);
    }

    const containsNameWhere = this.buildNameWhere("contains", query.q);
    const containsWhere = this.withPokemonScope(
      { AND: [containsNameWhere, { NOT: prefixNameWhere }] },
      pokemonScope,
    );
    const containsMatches = await this.prisma.move.findMany({
      where: containsWhere,
      select: moveSummarySelect,
      orderBy: deterministicOrderBy,
      take: remaining,
    });

    return moveSummarySchema.array().parse([...prefixMatches, ...containsMatches]);
  }

  private buildNameWhere(operator: "startsWith" | "contains", q: string): Prisma.MoveWhereInput {
    return {
      OR: [{ nameJa: { [operator]: q } }, { nameEn: { [operator]: q, mode: "insensitive" } }],
    };
  }

  private buildPokemonScope(pokemonId: number | undefined): Prisma.MoveWhereInput | undefined {
    return pokemonId === undefined ? undefined : { learnedBy: { some: { pokemonId } } };
  }

  private withPokemonScope(
    where: Prisma.MoveWhereInput,
    pokemonScope: Prisma.MoveWhereInput | undefined,
  ): Prisma.MoveWhereInput {
    return pokemonScope ? { AND: [pokemonScope, where] } : where;
  }
}
