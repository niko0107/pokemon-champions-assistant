import type { ArchetypeSnapshot, RankedCandidate } from "@pokemon-champions/scoring";
import {
  adminArchetypeWriteSchema,
  type AdminArchetypePreviewRequest,
} from "@pokemon-champions/shared";
import { describe, expect, it } from "vitest";
import {
  buildPreviewObservations,
  canonicalizeInput,
  canonicalizeSnapshot,
  canonicalKey,
  findExactDuplicateId,
  toPreviewCandidate,
} from "./archetype-preview";

const baseRaw = {
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
      itemAlternatives: [21, 22],
      abilityId: 30,
      role: "lead",
      moves: [{ moveId: 40 }, { moveId: 41 }],
    },
    {
      slot: 2,
      pokemonId: 11,
      itemId: 23,
      itemAlternatives: [],
      abilityId: 31,
      role: "sweeper",
      // 40 は 10 と 11 の両方が持つ(別ポケモンの同一技)
      moves: [{ moveId: 40 }, { moveId: 42 }],
    },
  ],
  sources: [{ title: "記事", url: "https://example.com/a", siteName: "Example" }],
} as const;

function makeInput(raw: unknown = baseRaw): AdminArchetypePreviewRequest {
  return adminArchetypeWriteSchema.parse(raw);
}

const noMega = new Map<number, boolean>([
  [10, false],
  [11, false],
]);

function inputKey(raw: unknown = baseRaw, isMega: ReadonlyMap<number, boolean> = noMega): string {
  return canonicalKey(canonicalizeInput(makeInput(raw), isMega));
}

describe("archetype-preview canonicalize (完全重複判定)", () => {
  const base = inputKey();

  it("完全に同じ構築は同一キーになる", () => {
    expect(inputKey()).toBe(base);
  });

  it("ポケモンの入力順だけの違いは同一構築とみなす", () => {
    const reordered = {
      ...baseRaw,
      pokemons: [baseRaw.pokemons[1], baseRaw.pokemons[0]],
    };
    expect(inputKey(reordered)).toBe(base);
  });

  it("技の入力順だけの違いは同一構築とみなす", () => {
    const reordered = {
      ...baseRaw,
      pokemons: [
        { ...baseRaw.pokemons[0], moves: [{ moveId: 41 }, { moveId: 40 }] },
        baseRaw.pokemons[1],
      ],
    };
    expect(inputKey(reordered)).toBe(base);
  });

  it("代替持ち物の順番だけの違いは同一構築とみなす", () => {
    const reordered = {
      ...baseRaw,
      pokemons: [{ ...baseRaw.pokemons[0], itemAlternatives: [22, 21] }, baseRaw.pokemons[1]],
    };
    expect(inputKey(reordered)).toBe(base);
  });

  it.each([
    ["Season", { ...baseRaw, seasonId: 2 }],
    ["Rule", { ...baseRaw, ruleId: 2 }],
    [
      "Pokemon1体",
      { ...baseRaw, pokemons: [{ ...baseRaw.pokemons[0], pokemonId: 12 }, baseRaw.pokemons[1]] },
    ],
    [
      "Move1つ",
      {
        ...baseRaw,
        pokemons: [
          { ...baseRaw.pokemons[0], moves: [{ moveId: 99 }, { moveId: 41 }] },
          baseRaw.pokemons[1],
        ],
      },
    ],
    [
      "Item",
      { ...baseRaw, pokemons: [{ ...baseRaw.pokemons[0], itemId: 99 }, baseRaw.pokemons[1]] },
    ],
    [
      "Ability",
      { ...baseRaw, pokemons: [{ ...baseRaw.pokemons[0], abilityId: 99 }, baseRaw.pokemons[1]] },
    ],
    ["defaultLeads順序", { ...baseRaw, defaultLeads: [2, 1] }],
  ])("%sが異なると別構築になる", (_label, raw) => {
    expect(inputKey(raw)).not.toBe(base);
  });

  it("通常形態とメガ形態を別構築として区別する", () => {
    expect(
      inputKey(
        baseRaw,
        new Map([
          [10, true],
          [11, false],
        ]),
      ),
    ).not.toBe(base);
  });

  it("同じ技が別ポケモンに割り当てられている場合を混同しない", () => {
    // 全体の技集合は同じだが、ポケモンごとの割り当てが入れ替わっている
    const swapped = {
      ...baseRaw,
      pokemons: [
        { ...baseRaw.pokemons[0], moves: [{ moveId: 40 }, { moveId: 42 }] },
        { ...baseRaw.pokemons[1], moves: [{ moveId: 40 }, { moveId: 41 }] },
      ],
    };
    expect(inputKey(swapped)).not.toBe(base);
  });
});

function makeSnapshot(overrides: Partial<ArchetypeSnapshot> = {}): ArchetypeSnapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "展開構築",
    popularityTier: "mid",
    popularityScore: null,
    encounterCount: 0,
    defaultLeadSlots: [1, 2],
    updatedAt: "2026-07-25T00:00:00.000Z",
    pokemons: [
      {
        slot: 1,
        pokemonId: 10,
        itemId: 20,
        itemAlternativeIds: [21, 22],
        abilityId: 30,
        role: "lead",
        usageRate: 1,
        isMega: false,
        moves: [
          { moveId: 40, adoptionRate: 1, tags: [] },
          { moveId: 41, adoptionRate: 1, tags: [] },
        ],
      },
      {
        slot: 2,
        pokemonId: 11,
        itemId: 23,
        itemAlternativeIds: [],
        abilityId: 31,
        role: "sweeper",
        usageRate: 1,
        isMega: false,
        moves: [
          { moveId: 40, adoptionRate: 1, tags: [] },
          { moveId: 42, adoptionRate: 1, tags: [] },
        ],
      },
    ],
    ...overrides,
  };
}

describe("archetype-preview canonical は入力と Snapshot で一致する", () => {
  it("同一内容の入力と Snapshot が同じキーになる", () => {
    const fromSnapshot = canonicalKey(canonicalizeSnapshot(makeSnapshot(), 1, 1));
    expect(fromSnapshot).toBe(inputKey());
  });

  it("Snapshot の season/rule が異なると別キーになる", () => {
    expect(canonicalKey(canonicalizeSnapshot(makeSnapshot(), 2, 1))).not.toBe(inputKey());
  });
});

describe("buildPreviewObservations", () => {
  it("採用ポケモン・技・確定持ち物・特性・先頭先発を観測列へ変換する", () => {
    const observations = buildPreviewObservations(makeInput(), noMega);

    // pokemon(2) + move(4) + item(2) + ability(2) + lead(1) = 11
    expect(observations).toHaveLength(11);
    expect(observations.every((observation) => observation.isRevoked === false)).toBe(true);

    const kinds = observations.map((observation) => observation.kind);
    expect(kinds.filter((kind) => kind === "pokemon")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "move")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "item")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "ability")).toHaveLength(2);

    // 先頭先発(slot1=pokemon10)のみ lead 観測を1件だけ出す
    const leads = observations.filter((observation) => observation.kind === "position");
    expect(leads).toEqual([
      expect.objectContaining({ kind: "position", pokemonId: 10, position: "lead" }),
    ]);

    // seq は 1 から一意・決定的
    expect(observations.map((observation) => observation.seq)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("メガ形態のポケモンには mega 観測を出す", () => {
    const observations = buildPreviewObservations(
      makeInput(),
      new Map([
        [10, true],
        [11, false],
      ]),
    );
    const mega = observations.filter((observation) => observation.kind === "mega");
    expect(mega).toEqual([expect.objectContaining({ kind: "mega", pokemonId: 10 })]);
  });

  it("確定持ち物・特性が無いポケモンでは item/ability 観測を出さない", () => {
    const raw = {
      ...baseRaw,
      pokemons: [
        { slot: 1, pokemonId: 10, role: "lead", moves: [{ moveId: 40 }] },
        baseRaw.pokemons[1],
      ],
      defaultLeads: [1, 2],
    };
    const observations = buildPreviewObservations(makeInput(raw), noMega);
    const first = observations.filter((observation) => observation.pokemonId === 10);
    expect(first.some((observation) => observation.kind === "item")).toBe(false);
    expect(first.some((observation) => observation.kind === "ability")).toBe(false);
  });
});

describe("findExactDuplicateId", () => {
  it("一致が無ければ null", () => {
    expect(findExactDuplicateId("key", [{ archetypeId: "a", canonicalKey: "other" }])).toBeNull();
  });

  it("複数一致時は最小IDを決定的に返す", () => {
    expect(
      findExactDuplicateId("key", [
        { archetypeId: "b", canonicalKey: "key" },
        { archetypeId: "a", canonicalKey: "key" },
        { archetypeId: "c", canonicalKey: "other" },
      ]),
    ).toBe("a");
  });
});

describe("toPreviewCandidate", () => {
  it("表示項目だけを射影し、内部値は含めない", () => {
    const ranked: RankedCandidate = {
      archetypeId: "11111111-1111-4111-8111-111111111111",
      matchRate: 90,
      rawScore: 45,
      maxScore: 50,
      matched: [{ observationSeq: 1, kind: "pokemon", matched: true, points: 10, pokemonId: 10 }],
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 11, usageRate: 1 }],
      threatMoveIds: [42],
      rank: 1,
    };

    const candidate = toPreviewCandidate(ranked, makeSnapshot());

    expect(candidate).toEqual({
      archetypeId: "11111111-1111-4111-8111-111111111111",
      name: "展開構築",
      matchRate: 90,
      rank: 1,
      popularityTier: "mid",
      matched: ranked.matched,
      contradictions: [],
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 11, usageRate: 1 }],
      threatMoveIds: [42],
    });
    expect(candidate).not.toHaveProperty("rawScore");
    expect(candidate).not.toHaveProperty("maxScore");
    expect(candidate).not.toHaveProperty("excluded");
  });
});
