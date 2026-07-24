import { describe, expect, it, vi, beforeEach } from "vitest";
import { POKEMON_SEARCH_RESULT_LIMIT, type PokemonSummary } from "@pokemon-champions/shared";
import { PokemonSearchService } from "./pokemon-search.service";
import type { PrismaService } from "../prisma/prisma.service";

function summary(overrides: Partial<PokemonSummary>): PokemonSummary {
  return {
    id: 1,
    dexNo: 130,
    nameJa: "ギャラドス",
    nameEn: "Gyarados",
    form: "normal",
    type1: "water",
    type2: "flying",
    isMega: false,
    basePokemonId: null,
    ...overrides,
  };
}

const gyarados = summary({});
const megaGyarados = summary({
  id: 4,
  nameJa: "メガギャラドス",
  nameEn: "Mega Gyarados",
  form: "mega",
  type2: "dark",
  isMega: true,
  basePokemonId: 1,
});

describe("PokemonSearchService", () => {
  const findMany = vi.fn();
  const service = new PokemonSearchService({
    pokemon: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    findMany.mockReset();
  });

  it("前方一致を先頭に、部分一致(前方一致除外)を後段に結合して返す", async () => {
    findMany.mockResolvedValueOnce([gyarados]).mockResolvedValueOnce([megaGyarados]);

    const result = await service.search({ q: "ギャラ" });

    expect(result).toEqual([gyarados, megaGyarados]);
    expect(findMany).toHaveBeenCalledTimes(2);

    // 1回目: 前方一致(日本語名は完全一致比較、英語名・フォルムは大文字小文字を区別しない)
    const prefixArgs = findMany.mock.calls[0]?.[0];
    expect(prefixArgs.where).toEqual({
      OR: [
        { nameJa: { startsWith: "ギャラ" } },
        { nameEn: { startsWith: "ギャラ", mode: "insensitive" } },
        { form: { startsWith: "ギャラ", mode: "insensitive" } },
      ],
    });
    expect(prefixArgs.take).toBe(POKEMON_SEARCH_RESULT_LIMIT);

    // 2回目: 部分一致から前方一致分を除外し、残り件数のみ取得
    const containsArgs = findMany.mock.calls[1]?.[0];
    expect(containsArgs.where.AND[1]).toEqual({ NOT: prefixArgs.where });
    expect(containsArgs.where.AND[0].OR[0]).toEqual({ nameJa: { contains: "ギャラ" } });
    expect(containsArgs.take).toBe(POKEMON_SEARCH_RESULT_LIMIT - 1);
  });

  it("並び順の指定が決定的である(dexNo → isMega → form → id)", async () => {
    findMany.mockResolvedValue([]);

    await service.search({ q: "dragon" });

    const expectedOrderBy = [
      { dexNo: "asc" },
      { isMega: "asc" },
      { form: "asc" },
      { id: "asc" },
    ];
    expect(findMany.mock.calls[0]?.[0].orderBy).toEqual(expectedOrderBy);
    expect(findMany.mock.calls[1]?.[0].orderBy).toEqual(expectedOrderBy);
  });

  it("前方一致だけで上限に達した場合は部分一致クエリを実行しない", async () => {
    const fullPage = Array.from({ length: POKEMON_SEARCH_RESULT_LIMIT }, (_, index) =>
      summary({ id: index + 1 }),
    );
    findMany.mockResolvedValueOnce(fullPage);

    const result = await service.search({ q: "ドラ" });

    expect(result).toHaveLength(POKEMON_SEARCH_RESULT_LIMIT);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("0件の場合は空配列を返す", async () => {
    findMany.mockResolvedValue([]);

    await expect(service.search({ q: "ミュウツー" })).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("abilities や種族値を取得対象に含めない", async () => {
    findMany.mockResolvedValue([]);

    await service.search({ q: "カバ" });

    const select = findMany.mock.calls[0]?.[0].select;
    expect(select).toEqual({
      id: true,
      dexNo: true,
      nameJa: true,
      nameEn: true,
      form: true,
      type1: true,
      type2: true,
      isMega: true,
      basePokemonId: true,
    });
  });
});
