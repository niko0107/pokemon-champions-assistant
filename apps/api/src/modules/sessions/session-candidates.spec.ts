import { Prisma } from "@pokemon-champions/database";
import type { RankedCandidate } from "@pokemon-champions/scoring";
import { describe, expect, it } from "vitest";
import {
  toArchetypeSnapshot,
  toBattleCandidate,
  toObservationInput,
  type CandidateArchetypeRecord,
  type CandidateObservationRecord,
} from "./session-candidates";

function observation(overrides: Partial<CandidateObservationRecord>): CandidateObservationRecord {
  return {
    seq: 1,
    kind: "pokemon",
    pokemonId: 10,
    moveId: null,
    itemId: null,
    abilityId: null,
    position: null,
    isRevoked: false,
    ...overrides,
  };
}

describe("session candidate ObservationInput変換", () => {
  it.each([
    [observation({ kind: "pokemon" }), { kind: "pokemon", pokemonId: 10 }],
    [observation({ kind: "move", moveId: 20 }), { kind: "move", pokemonId: 10, moveId: 20 }],
    [observation({ kind: "item", itemId: 30 }), { kind: "item", pokemonId: 10, itemId: 30 }],
    [
      observation({ kind: "ability", abilityId: 40 }),
      { kind: "ability", pokemonId: 10, abilityId: 40 },
    ],
    [
      observation({ kind: "position", position: "lead" }),
      { kind: "position", pokemonId: 10, position: "lead" },
    ],
    [observation({ kind: "mega" }), { kind: "mega", pokemonId: 10 }],
  ] as const)("%sをkind別のscoring入力へ変換する", (record, expected) => {
    expect(toObservationInput(record)).toEqual({
      seq: 1,
      isRevoked: false,
      ...expected,
    });
  });

  it("取消済み状態を保持してscoringへ渡す", () => {
    expect(toObservationInput(observation({ isRevoked: true }))).toMatchObject({
      isRevoked: true,
    });
  });

  it.each([
    observation({ kind: "move", moveId: null }),
    observation({ kind: "pokemon", moveId: 20 }),
    observation({ kind: "position", position: "ace" }),
    observation({ kind: "unknown" }),
    observation({ pokemonId: null }),
  ])("不正なDB観測を推測で補完せず拒否する", (record) => {
    expect(() => toObservationInput(record)).toThrow();
  });
});

const archetypeRecord: CandidateArchetypeRecord = {
  id: "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e",
  name: "展開構築",
  popularityTier: "high",
  popularityScore: new Prisma.Decimal(50),
  encounterCount: 4,
  defaultLeads: [1],
  updatedAt: new Date("2026-07-26T00:00:00.000Z"),
  pokemons: [
    {
      slot: 1,
      pokemonId: 10,
      itemId: 20,
      itemAlternatives: [21],
      abilityId: 30,
      role: "lead",
      usageRate: new Prisma.Decimal(0.8),
      pokemon: { isMega: false },
      moves: [
        {
          moveId: 40,
          adoptionRate: new Prisma.Decimal(0.5),
          move: { tags: ["hazard"] },
        },
      ],
    },
  ],
};

describe("session candidate ArchetypeSnapshot変換", () => {
  it("Decimal・JSONB・日時・子要素を型安全に変換する", () => {
    expect(toArchetypeSnapshot(archetypeRecord)).toEqual({
      id: archetypeRecord.id,
      name: "展開構築",
      popularityTier: "high",
      popularityScore: 50,
      encounterCount: 4,
      defaultLeadSlots: [1],
      updatedAt: "2026-07-26T00:00:00.000Z",
      pokemons: [
        {
          slot: 1,
          pokemonId: 10,
          itemId: 20,
          itemAlternativeIds: [21],
          abilityId: 30,
          role: "lead",
          usageRate: 0.8,
          isMega: false,
          moves: [{ moveId: 40, adoptionRate: 0.5, tags: ["hazard"] }],
        },
      ],
    });
  });

  it.each([
    { ...archetypeRecord, popularityTier: "unknown" },
    { ...archetypeRecord, defaultLeads: [2] },
    {
      ...archetypeRecord,
      pokemons: [
        {
          ...archetypeRecord.pokemons[0]!,
          moves: [
            {
              ...archetypeRecord.pokemons[0]!.moves[0]!,
              move: { tags: ["unknown"] },
            },
          ],
        },
      ],
    },
  ] as CandidateArchetypeRecord[])("不正なSnapshot材料を黙って除外せず拒否する", (record) => {
    expect(() => toArchetypeSnapshot(record)).toThrow();
  });

  it("RankedCandidateから内部スコアを除いてAPI候補へ射影する", () => {
    const ranked: RankedCandidate = {
      archetypeId: archetypeRecord.id,
      matchRate: 80,
      rawScore: 8,
      maxScore: 10,
      matched: [],
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 10, usageRate: 0.8 }],
      threatMoveIds: [40],
      rank: 1,
    };
    const candidate = toBattleCandidate(ranked, toArchetypeSnapshot(archetypeRecord));

    expect(candidate).toMatchObject({
      archetypeId: archetypeRecord.id,
      name: "展開構築",
      matchRate: 80,
      rank: 1,
      popularityTier: "high",
      likelyUnseen: [{ pokemonId: 10, usageRate: 0.8 }],
      threatMoveIds: [40],
    });
    expect(candidate).not.toHaveProperty("rawScore");
    expect(candidate).not.toHaveProperty("maxScore");
    expect(candidate).not.toHaveProperty("excluded");
  });
});
