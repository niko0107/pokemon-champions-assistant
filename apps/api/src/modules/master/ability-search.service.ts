import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  abilitySummarySchema,
  MASTER_SEARCH_RESULT_LIMIT,
  pokemonAbilitiesSchema,
  type AbilitySearchQuery,
  type AbilitySummary,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const abilitySummarySelect = {
  id: true,
  nameJa: true,
  nameEn: true,
  effectTags: true,
} satisfies Prisma.AbilitySelect;

const deterministicOrderBy = [
  { nameJa: "asc" },
  { nameEn: "asc" },
  { id: "asc" },
] satisfies Prisma.AbilityOrderByWithRelationInput[];

@Injectable()
export class AbilitySearchService {
  private readonly logger = new Logger(AbilitySearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pokemon.abilities JSONBの日本語名を、Ability.nameJaへ解決して候補を返す。
   * 関連テーブルがない現行スキーマで全件返却は行わない。
   */
  async search(query: AbilitySearchQuery): Promise<AbilitySummary[]> {
    const pokemon = await this.prisma.pokemon.findUnique({
      where: { id: query.pokemon_id },
      select: { abilities: true },
    });

    if (!pokemon) {
      return [];
    }

    const parsedAbilities = pokemonAbilitiesSchema.safeParse(pokemon.abilities);
    if (!parsedAbilities.success) {
      this.throwIntegrityError(
        `Pokemon id=${query.pokemon_id} has invalid abilities JSON: ${parsedAbilities.error.message}`,
      );
    }

    const abilityNames = parsedAbilities.data.slice(0, MASTER_SEARCH_RESULT_LIMIT);
    const matches = await this.prisma.ability.findMany({
      where: { nameJa: { in: abilityNames } },
      select: abilitySummarySelect,
      orderBy: deterministicOrderBy,
      take: MASTER_SEARCH_RESULT_LIMIT,
    });
    const summaries = abilitySummarySchema.array().parse(matches);

    if (summaries.length !== abilityNames.length) {
      this.throwIntegrityError(
        `Pokemon id=${query.pokemon_id} references abilities missing from Ability master`,
      );
    }

    return summaries;
  }

  private throwIntegrityError(logMessage: string): never {
    this.logger.error(logMessage);
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Master Data Integrity Error",
      status: 500,
      code: "INTERNAL_ERROR",
    };
    throw new InternalServerErrorException(problem);
  }
}
