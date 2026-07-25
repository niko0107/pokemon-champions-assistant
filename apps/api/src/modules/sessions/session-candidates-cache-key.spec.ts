import type { ArchetypeSnapshot, ObservationInput } from "@pokemon-champions/scoring";
import { describe, expect, it } from "vitest";
import {
  buildBattleCandidatesCacheKey,
  type BattleCandidatesCacheState,
} from "./session-candidates-cache-key";

const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const archetypeId = "11111111-1111-4111-8111-111111111111";

function observation(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    seq: 1,
    kind: "pokemon",
    pokemonId: 10,
    isRevoked: false,
    ...overrides,
  };
}

function archetype(overrides: Partial<ArchetypeSnapshot> = {}): ArchetypeSnapshot {
  return {
    id: archetypeId,
    name: "展開構築",
    popularityTier: "mid",
    popularityScore: 50,
    encounterCount: 10,
    defaultLeadSlots: [1, 2],
    updatedAt: "2026-07-25T00:00:00.000Z",
    pokemons: [
      {
        slot: 1,
        pokemonId: 10,
        itemId: 20,
        itemAlternativeIds: [22, 21],
        abilityId: 30,
        role: "lead",
        usageRate: 1,
        isMega: false,
        moves: [
          { moveId: 42, adoptionRate: 0.5, tags: ["priority"] },
          { moveId: 40, adoptionRate: 1, tags: ["hazard", "pivot"] },
        ],
      },
    ],
    ...overrides,
  };
}

function state(overrides: Partial<BattleCandidatesCacheState> = {}): BattleCandidatesCacheState {
  return {
    session: {
      id: sessionId,
      ruleId: 1,
      status: "active",
      selectedArchetypeId: null,
    },
    observations: [observation()],
    archetypes: [archetype()],
    ...overrides,
  };
}

describe("buildBattleCandidatesCacheKey", () => {
  it("同一状態から同一キーを生成し、秘密情報や状態本文を露出しない", () => {
    const first = buildBattleCandidatesCacheKey(state());
    const second = buildBattleCandidatesCacheKey(state());

    expect(first).toBe(second);
    expect(first).toMatch(new RegExp(`^battle:candidates:v1:${sessionId}:[0-9a-f]{64}$`));
    expect(first).not.toContain("展開構築");
  });

  it("Observation追加・Undo・seq変更でversionが変わる", () => {
    const original = buildBattleCandidatesCacheKey(state());
    const added = buildBattleCandidatesCacheKey(
      state({
        observations: [observation(), observation({ seq: 2, kind: "move", moveId: 40 })],
      }),
    );
    const revoked = buildBattleCandidatesCacheKey(
      state({ observations: [observation({ isRevoked: true })] }),
    );
    const resequenced = buildBattleCandidatesCacheKey(
      state({ observations: [observation({ seq: 2 })] }),
    );

    expect(new Set([original, added, revoked, resequenced])).toHaveLength(4);
  });

  it("Rule・Session状態・候補選択の変更でversionが変わる", () => {
    const originalState = state();
    const original = buildBattleCandidatesCacheKey(originalState);
    const ruleChanged = buildBattleCandidatesCacheKey(
      state({ session: { ...originalState.session, ruleId: 2 } }),
    );
    const ended = buildBattleCandidatesCacheKey(
      state({ session: { ...originalState.session, status: "ended" } }),
    );
    const selected = buildBattleCandidatesCacheKey(
      state({
        session: {
          ...originalState.session,
          selectedArchetypeId: archetypeId,
        },
      }),
    );

    expect(new Set([original, ruleChanged, ended, selected])).toHaveLength(4);
  });

  it("Archetype更新日時・人気度・候補集合の変更でversionが変わる", () => {
    const original = buildBattleCandidatesCacheKey(state());
    const updated = buildBattleCandidatesCacheKey(
      state({
        archetypes: [archetype({ updatedAt: "2026-07-26T00:00:00.000Z" })],
      }),
    );
    const popularityChanged = buildBattleCandidatesCacheKey(
      state({
        archetypes: [
          archetype({
            popularityTier: "high",
            popularityScore: 90,
            encounterCount: 20,
          }),
        ],
      }),
    );
    const archived = buildBattleCandidatesCacheKey(state({ archetypes: [] }));

    expect(new Set([original, updated, popularityChanged, archived])).toHaveLength(4);
  });

  it("意味を持たない配列順には依存せず決定的に生成する", () => {
    const secondArchetype = archetype({
      id: "22222222-2222-4222-8222-222222222222",
      name: "対面構築",
    });
    const first = state({
      observations: [observation({ seq: 2, kind: "move", moveId: 40 }), observation()],
      archetypes: [secondArchetype, archetype()],
    });
    const reorderedSnapshot = archetype({
      defaultLeadSlots: [2, 1],
      pokemons: [
        {
          ...archetype().pokemons[0]!,
          itemAlternativeIds: [21, 22],
          moves: [...archetype().pokemons[0]!.moves].reverse().map((move) => ({
            ...move,
            tags: [...move.tags].reverse(),
          })),
        },
      ],
    });
    const second = state({
      observations: [observation(), observation({ seq: 2, kind: "move", moveId: 40 })],
      archetypes: [reorderedSnapshot, secondArchetype],
    });

    expect(buildBattleCandidatesCacheKey(first)).toBe(buildBattleCandidatesCacheKey(second));
  });
});
