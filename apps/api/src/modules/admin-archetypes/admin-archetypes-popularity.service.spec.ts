import { Prisma } from "@pokemon-champions/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminArchetypesService } from "./admin-archetypes.service";

const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";
const updatedAt = new Date("2026-07-26T00:00:00.000Z");

function record(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: archetypeId,
    popularityTier: "high",
    popularityScore: null,
    encounterCount: 0,
    pickCount: 0,
    updatedAt,
    ...overrides,
  };
}

describe("AdminArchetypesService.updatePopularity (ARCHETYPE-003)", () => {
  const update = vi.fn();
  const prisma = { archetype: { update } } as unknown as PrismaService;
  const service = new AdminArchetypesService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(record());
  });

  it("popularityTierのみ指定時は他項目をdataに含めない", async () => {
    await service.updatePopularity(archetypeId, { popularityTier: "mid" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: archetypeId },
        data: { popularityTier: "mid" },
      }),
    );
  });

  it("popularityScore・encounterCount・pickCountを更新する", async () => {
    update.mockResolvedValue(
      record({
        popularityTier: "low",
        popularityScore: new Prisma.Decimal(42.5),
        encounterCount: 10,
        pickCount: 3,
      }),
    );

    const result = await service.updatePopularity(archetypeId, {
      popularityTier: "low",
      popularityScore: 42.5,
      encounterCount: 10,
      pickCount: 3,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { popularityTier: "low", popularityScore: 42.5, encounterCount: 10, pickCount: 3 },
      }),
    );
    expect(result).toEqual({
      id: archetypeId,
      popularityTier: "low",
      popularityScore: 42.5,
      encounterCount: 10,
      pickCount: 3,
      updatedAt: "2026-07-26T00:00:00.000Z",
    });
  });

  it("popularityScore=nullを明示的にクリアとして反映する", async () => {
    await service.updatePopularity(archetypeId, { popularityTier: "high", popularityScore: null });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { popularityTier: "high", popularityScore: null } }),
    );
  });

  it("Decimalのpopularityscoreを数値へ、updatedAtをISO文字列へ変換して返す", async () => {
    update.mockResolvedValue(record({ popularityScore: new Prisma.Decimal(0) }));
    const result = await service.updatePopularity(archetypeId, { popularityTier: "high" });
    expect(result.popularityScore).toBe(0);
    expect(result.updatedAt).toBe("2026-07-26T00:00:00.000Z");
  });

  it("存在しない構築(P2025)を404 NOT_FOUNDに変換する", async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record to update not found", {
        code: "P2025",
        clientVersion: "6.19.3",
      }),
    );

    await expect(
      service.updatePopularity(archetypeId, { popularityTier: "high" }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });
  });
});
