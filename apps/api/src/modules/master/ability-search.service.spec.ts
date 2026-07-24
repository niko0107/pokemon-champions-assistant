import { InternalServerErrorException, Logger } from "@nestjs/common";
import type { AbilitySummary } from "@pokemon-champions/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AbilitySearchService } from "./ability-search.service";

const intimidate: AbilitySummary = {
  id: 1,
  nameJa: "いかく",
  nameEn: "Intimidate",
  effectTags: ["stat_control"],
};

const moxie: AbilitySummary = {
  id: 2,
  nameJa: "じしんかじょう",
  nameEn: "Moxie",
  effectTags: ["stat_control"],
};

describe("AbilitySearchService", () => {
  const findUnique = vi.fn();
  const findMany = vi.fn();
  const service = new AbilitySearchService({
    pokemon: { findUnique },
    ability: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Pokemon.abilitiesを検証し、日本語名でAbilityマスタを解決する", async () => {
    findUnique.mockResolvedValue({ abilities: ["いかく", "じしんかじょう"] });
    findMany.mockResolvedValue([intimidate, moxie]);

    await expect(service.search({ pokemon_id: 130 })).resolves.toEqual([intimidate, moxie]);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 130 },
      select: { abilities: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { nameJa: { in: ["いかく", "じしんかじょう"] } },
      select: {
        id: true,
        nameJa: true,
        nameEn: true,
        effectTags: true,
      },
      orderBy: [{ nameJa: "asc" }, { nameEn: "asc" }, { id: "asc" }],
      take: 10,
    });
  });

  it("存在しないpokemon_idは空配列を返し、Abilityを検索しない", async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.search({ pokemon_id: 9999 })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("不正なabilities JSONはRFC 9457形式の500にする", async () => {
    findUnique.mockResolvedValue({ abilities: [] });
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(service.search({ pokemon_id: 130 })).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        title: "Master Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("Abilityマスタに解決できない名前がある場合は500にする", async () => {
    findUnique.mockResolvedValue({ abilities: ["いかく", "じしんかじょう"] });
    findMany.mockResolvedValue([intimidate]);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(service.search({ pokemon_id: 130 })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
