import { Prisma } from "@pokemon-champions/database";
import {
  adminArchetypeWriteSchema,
  type AdminArchetypePreviewRequest,
} from "@pokemon-champions/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminArchetypesService } from "./admin-archetypes.service";

const input: AdminArchetypePreviewRequest = adminArchetypeWriteSchema.parse({
  name: "展開構築",
  description: "起点を作る",
  seasonId: 1,
  ruleId: 1,
  defaultLeads: [1, 2],
  playstyleNotes: "先発から展開する",
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      abilityId: 30,
      actualStats: {
        hp: 215,
        attack: 132,
        defense: 187,
        specialAttack: 88,
        specialDefense: 93,
        speed: 67,
      },
      role: "lead",
      moves: [{ moveId: 40 }],
    },
    {
      slot: 2,
      pokemonId: 11,
      itemId: 21,
      abilityId: 30,
      actualStats: {
        hp: 180,
        attack: 172,
        defense: 95,
        specialAttack: 120,
        specialDefense: 95,
        speed: 194,
      },
      role: "sweeper",
      moves: [{ moveId: 41 }],
    },
  ],
  sources: [{ title: "記事", url: "https://example.com/a", siteName: "Example" }],
});

interface RecordPokemon {
  slot: number;
  pokemonId: number;
  itemId: number | null;
  abilityId: number | null;
  role: string;
  isMega: boolean;
  moveIds: number[];
  moveTags?: Record<number, string[]>;
}

interface RecordOptions {
  id: string;
  popularityTier?: string;
  encounterCount?: number;
  updatedAt?: string;
  pokemons: RecordPokemon[];
  defaultLeads?: number[];
}

function makeRecord(options: RecordOptions): unknown {
  return {
    id: options.id,
    name: `構築-${options.id}`,
    seasonId: 1,
    ruleId: 1,
    popularityTier: options.popularityTier ?? "mid",
    popularityScore: null,
    encounterCount: options.encounterCount ?? 0,
    defaultLeads: options.defaultLeads ?? [1, 2],
    updatedAt: new Date(options.updatedAt ?? "2026-07-25T00:00:00.000Z"),
    pokemons: options.pokemons.map((pokemon) => ({
      slot: pokemon.slot,
      pokemonId: pokemon.pokemonId,
      itemId: pokemon.itemId,
      itemAlternatives: [],
      abilityId: pokemon.abilityId,
      role: pokemon.role,
      usageRate: new Prisma.Decimal(1),
      pokemon: { isMega: pokemon.isMega },
      moves: pokemon.moveIds.map((moveId) => ({
        moveId,
        adoptionRate: new Prisma.Decimal(1),
        move: { tags: pokemon.moveTags?.[moveId] ?? [] },
      })),
    })),
  };
}

/** 入力と完全一致する既存構築のレコード。 */
function exactRecord(id: string, tier = "mid"): unknown {
  return makeRecord({
    id,
    popularityTier: tier,
    pokemons: [
      {
        slot: 1,
        pokemonId: 10,
        itemId: 20,
        abilityId: 30,
        role: "lead",
        isMega: false,
        moveIds: [40],
      },
      {
        slot: 2,
        pokemonId: 11,
        itemId: 21,
        abilityId: 30,
        role: "sweeper",
        isMega: false,
        moveIds: [41],
      },
    ],
  });
}

describe("AdminArchetypesService.preview (ARCHETYPE-005)", () => {
  const archetypeFindMany = vi.fn();
  const pokemonFindMany = vi.fn();
  const seasonFindUnique = vi.fn();
  const ruleFindUnique = vi.fn();
  const itemFindMany = vi.fn();
  const abilityFindMany = vi.fn();
  const moveFindMany = vi.fn();
  const pokemonMoveFindMany = vi.fn();

  // 書き込み系は呼ばれないことを保証するためのスパイ
  const runTransaction = vi.fn();
  const archetypeCreate = vi.fn();
  const archetypeUpdate = vi.fn();
  const archetypeUpdateMany = vi.fn();
  const archetypeDelete = vi.fn();
  const archetypeDeleteMany = vi.fn();
  const archetypeUpsert = vi.fn();

  const prisma = {
    $transaction: runTransaction,
    archetype: {
      findMany: archetypeFindMany,
      create: archetypeCreate,
      update: archetypeUpdate,
      updateMany: archetypeUpdateMany,
      delete: archetypeDelete,
      deleteMany: archetypeDeleteMany,
      upsert: archetypeUpsert,
    },
    pokemon: { findMany: pokemonFindMany },
    season: { findUnique: seasonFindUnique },
    rule: { findUnique: ruleFindUnique },
    item: { findMany: itemFindMany },
    ability: { findMany: abilityFindMany },
    move: { findMany: moveFindMany },
    pokemonMove: { findMany: pokemonMoveFindMany },
  };
  const service = new AdminArchetypesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    // validateReferences 用(全マスタ参照OK)
    seasonFindUnique.mockResolvedValue({ id: 1 });
    ruleFindUnique.mockResolvedValue({ id: 1, teamSize: 2, pickSize: 2 });
    pokemonFindMany.mockResolvedValue([
      { id: 10, abilities: ["いかく"], isMega: false },
      { id: 11, abilities: ["いかく"], isMega: false },
    ]);
    itemFindMany.mockResolvedValue([{ id: 20 }, { id: 21 }]);
    abilityFindMany.mockResolvedValue([{ id: 30, nameJa: "いかく" }]);
    moveFindMany.mockResolvedValue([{ id: 40 }, { id: 41 }]);
    pokemonMoveFindMany.mockResolvedValue([
      { pokemonId: 10, moveId: 40 },
      { pokemonId: 11, moveId: 41 },
    ]);
    archetypeFindMany.mockResolvedValue([]);
  });

  function expectNoWrites(): void {
    expect(runTransaction).not.toHaveBeenCalled();
    expect(archetypeCreate).not.toHaveBeenCalled();
    expect(archetypeUpdate).not.toHaveBeenCalled();
    expect(archetypeUpdateMany).not.toHaveBeenCalled();
    expect(archetypeDelete).not.toHaveBeenCalled();
    expect(archetypeDeleteMany).not.toHaveBeenCalled();
    expect(archetypeUpsert).not.toHaveBeenCalled();
  }

  it("published かつ同一season+ruleのみを比較対象にし、DBを一切変更しない", async () => {
    archetypeFindMany.mockResolvedValue([exactRecord("11111111-1111-4111-8111-111111111111")]);

    const result = await service.preview(input);

    expect(archetypeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: 1, ruleId: 1, status: "published" },
        take: 500,
      }),
    );
    expect(result.exactDuplicate).toBe(true);
    expectNoWrites();
  });

  it("完全一致する既存構築を exactDuplicate として返す(200・409にしない)", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    archetypeFindMany.mockResolvedValue([exactRecord(id)]);

    const result = await service.preview(input);

    expect(result.exactDuplicate).toBe(true);
    expect(result.exactDuplicateArchetypeId).toBe(id);
    expect(result.candidates[0]).toMatchObject({ archetypeId: id, rank: 1, matchRate: 100 });
  });

  it("完全一致が無ければ exactDuplicate=false / null", async () => {
    archetypeFindMany.mockResolvedValue([
      makeRecord({
        id: "22222222-2222-4222-8222-222222222222",
        pokemons: [
          {
            slot: 1,
            pokemonId: 10,
            itemId: 20,
            abilityId: 30,
            role: "lead",
            isMega: false,
            moveIds: [40],
          },
          {
            slot: 2,
            pokemonId: 11,
            itemId: 99,
            abilityId: 30,
            role: "sweeper",
            isMega: false,
            moveIds: [41],
          },
        ],
      }),
    ]);

    const result = await service.preview(input);

    expect(result.exactDuplicate).toBe(false);
    expect(result.exactDuplicateArchetypeId).toBeNull();
    // 一部一致(item違い)だが除外条件には該当せず候補には残る
    expect(result.candidates).toHaveLength(1);
  });

  it("候補が0件でも正常に空配列を返す", async () => {
    archetypeFindMany.mockResolvedValue([]);

    const result = await service.preview(input);

    expect(result).toEqual({
      exactDuplicate: false,
      exactDuplicateArchetypeId: null,
      candidates: [],
    });
  });

  it("一致0件(全ポケモン不一致)の候補も除外されずmatchRate0で返る", async () => {
    archetypeFindMany.mockResolvedValue([
      makeRecord({
        id: "33333333-3333-4333-8333-333333333333",
        pokemons: [
          {
            slot: 1,
            pokemonId: 90,
            itemId: 20,
            abilityId: 30,
            role: "lead",
            isMega: false,
            moveIds: [40],
          },
          {
            slot: 2,
            pokemonId: 91,
            itemId: 21,
            abilityId: 30,
            role: "sweeper",
            isMega: false,
            moveIds: [41],
          },
        ],
      }),
    ]);

    const result = await service.preview(input);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.matchRate).toBe(0);
  });

  it("popularityTierで一致度同率の並びを決定する(high→mid)", async () => {
    const highId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const midId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    archetypeFindMany.mockResolvedValue([exactRecord(midId, "mid"), exactRecord(highId, "high")]);

    const result = await service.preview(input);

    expect(result.candidates.map((candidate) => candidate.archetypeId)).toEqual([highId, midId]);
    expect(result.candidates.map((candidate) => candidate.rank)).toEqual([1, 2]);
  });

  it("同tier・同一致度は encounterCount→updatedAt→archetypeId で決定的に並ぶ", async () => {
    const many = "44444444-4444-4444-8444-444444444444";
    const fewNewer = "55555555-5555-4555-8555-555555555555";
    const fewOlderA = "00000000-0000-4000-8000-000000000000";
    const fewOlderB = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    archetypeFindMany.mockResolvedValue([
      { ...(exactRecord(fewOlderB) as object) },
      { ...(exactRecord(fewOlderA) as object) },
      {
        ...(exactRecord(fewNewer) as object),
        encounterCount: 1,
        updatedAt: new Date("2026-07-26T00:00:00.000Z"),
      },
      { ...(exactRecord(many) as object), encounterCount: 5 },
    ]);

    const result = await service.preview(input);

    // encounterCount5 → (encounter1,新しい) → 同点は archetypeId 昇順、上位3件のみ
    expect(result.candidates.map((candidate) => candidate.archetypeId)).toEqual([
      many,
      fewNewer,
      fewOlderA,
    ]);
  });

  it("メガ矛盾で除外された候補は candidates に含めない", async () => {
    // 入力の pokemon10 をメガ扱いにする → mega 観測が出る
    pokemonFindMany.mockResolvedValue([
      { id: 10, abilities: ["いかく"], isMega: true },
      { id: 11, abilities: ["いかく"], isMega: false },
    ]);
    archetypeFindMany.mockResolvedValue([
      makeRecord({
        id: "66666666-6666-4666-8666-666666666666",
        pokemons: [
          {
            slot: 1,
            pokemonId: 10,
            itemId: 20,
            abilityId: 30,
            role: "lead",
            isMega: false,
            moveIds: [40],
          },
          {
            slot: 2,
            pokemonId: 11,
            itemId: 21,
            abilityId: 30,
            role: "sweeper",
            isMega: false,
            moveIds: [41],
          },
        ],
      }),
    ]);

    const result = await service.preview(input);

    expect(result.candidates).toHaveLength(0);
  });

  it("SCORE-007の likelyUnseen と threatMoveIds を候補に保持する", async () => {
    const id = "77777777-7777-4777-8777-777777777777";
    archetypeFindMany.mockResolvedValue([
      makeRecord({
        id,
        defaultLeads: [1, 2],
        pokemons: [
          {
            slot: 1,
            pokemonId: 10,
            itemId: 20,
            abilityId: 30,
            role: "lead",
            isMega: false,
            moveIds: [40],
          },
          {
            slot: 2,
            pokemonId: 11,
            itemId: 21,
            abilityId: 30,
            role: "sweeper",
            isMega: false,
            moveIds: [41],
          },
          {
            slot: 3,
            pokemonId: 12,
            itemId: null,
            abilityId: null,
            role: "support",
            isMega: false,
            moveIds: [50],
            moveTags: { 50: ["hazard"] },
          },
        ],
      }),
    ]);

    const result = await service.preview(input);

    const candidate = result.candidates[0];
    expect(candidate?.likelyUnseen).toEqual([{ pokemonId: 12, usageRate: 1 }]);
    expect(candidate?.threatMoveIds).toContain(50);
  });

  it("archived構築は比較対象に含めない(status=publishedで絞り込む)", async () => {
    await service.preview(input);
    expect(archetypeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "published" }) }),
    );
  });

  it("不正なマスタ参照は保存せず400 INVALID_MASTER_REFERENCEにする", async () => {
    seasonFindUnique.mockResolvedValue(null);

    await expect(service.preview(input)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_MASTER_REFERENCE" },
    });
    expect(archetypeFindMany).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
