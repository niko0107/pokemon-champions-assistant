import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PokemonDetailService } from "./pokemon-detail.service";

const gyarados = {
  id: 1,
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
};

describe("PokemonDetailService", () => {
  const findUnique = vi.fn();
  const service = new PokemonDetailService({
    pokemon: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it("必要項目だけをfindUniqueして通常形態の詳細を返す", async () => {
    findUnique.mockResolvedValue(gyarados);

    await expect(service.get(1)).resolves.toEqual(gyarados);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        dexNo: true,
        nameJa: true,
        nameEn: true,
        form: true,
        type1: true,
        type2: true,
        isMega: true,
        basePokemonId: true,
        baseHp: true,
        baseAtk: true,
        baseDef: true,
        baseSpa: true,
        baseSpd: true,
        baseSpe: true,
      },
    });
  });

  it("メガ形態と6種族値を返す", async () => {
    const mega = {
      ...gyarados,
      id: 2,
      nameJa: "メガギャラドス",
      nameEn: "Mega Gyarados",
      form: "mega",
      type2: "dark",
      isMega: true,
      basePokemonId: 1,
      baseHp: 95,
      baseAtk: 155,
      baseDef: 109,
      baseSpa: 70,
      baseSpd: 130,
      baseSpe: 81,
    };
    findUnique.mockResolvedValue(mega);

    await expect(service.get(2)).resolves.toEqual(mega);
  });

  it("存在しないIDを404にする", async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.get(9999)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Pokemon Not Found",
        status: 404,
        code: "NOT_FOUND",
      },
    });
  });

  it("不正なDB値を内部情報なしの500にする", async () => {
    findUnique.mockResolvedValue({ ...gyarados, baseHp: 0 });

    await expect(service.get(1)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Master Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("Prismaエラーを内部情報なしの500にする", async () => {
    findUnique.mockRejectedValue(new Error("private database connection string"));

    await expect(service.get(1)).rejects.toMatchObject({
      response: {
        type: "about:blank",
        title: "Master Data Integrity Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });
});
