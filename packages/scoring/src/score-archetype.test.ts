import { describe, expect, expectTypeOf, it } from "vitest";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { rankCandidates } from "./rank-candidates";
import { scoreArchetype } from "./score-archetype";
import type {
  ArchetypeMoveSnapshot,
  ArchetypePokemonSnapshot,
  ArchetypeSnapshot,
  ObservationInput,
  RankedCandidate,
  ScoredCandidate,
} from "./types";

/**
 * 一致度計算のテスト雛形。
 * ロジック実装タスク(SCORE-002〜005)で it.todo を実テストに置き換える。
 * テストケースは設計書 §7 および 付録A の具体例に基づく。
 */
describe("DEFAULT_SCORING_CONFIG", () => {
  it("設計書 付録B の初期値と一致する", () => {
    expect(DEFAULT_SCORING_CONFIG.pokemonHit).toBe(10);
    expect(DEFAULT_SCORING_CONFIG.moveHit).toBe(15);
    expect(DEFAULT_SCORING_CONFIG.itemHit).toBe(15);
    expect(DEFAULT_SCORING_CONFIG.pokemonMiss).toBe(20);
    expect(DEFAULT_SCORING_CONFIG.excludeMissCount).toBe(3);
  });
});

const createPokemon = (
  pokemonId: number,
  usageRate = 1,
  isMega = false,
  moves: readonly ArchetypeMoveSnapshot[] = [],
  options: {
    itemId?: number;
    itemAlternativeIds?: number[];
    abilityId?: number;
  } = {},
): ArchetypePokemonSnapshot => ({
  slot: pokemonId,
  pokemonId,
  itemId: options.itemId,
  itemAlternativeIds: options.itemAlternativeIds ?? [],
  abilityId: options.abilityId,
  role: null,
  usageRate,
  isMega,
  moves: [...moves],
});

const createMove = (moveId: number, adoptionRate = 1): ArchetypeMoveSnapshot => ({
  moveId,
  adoptionRate,
  tags: [],
});

const createArchetype = (
  pokemons: readonly ArchetypePokemonSnapshot[] = [],
  defaultLeadSlots: readonly number[] = [],
): ArchetypeSnapshot => ({
  id: "archetype-1",
  name: "test",
  popularityTier: "high",
  encounterCount: 0,
  defaultLeadSlots: [...defaultLeadSlots],
  updatedAt: "2026-01-01T00:00:00Z",
  pokemons: pokemons.map((pokemon, index) => ({ ...pokemon, slot: index + 1 })),
});

const observePokemon = (
  pokemonId: number | undefined,
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "pokemon",
  pokemonId,
  isRevoked,
});

const observeMove = (
  pokemonId: number | undefined,
  moveId: number | undefined,
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "move",
  pokemonId,
  moveId,
  isRevoked,
});

const observeItem = (
  pokemonId: number | undefined,
  itemId: number | undefined,
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "item",
  pokemonId,
  itemId,
  isRevoked,
});

const observeAbility = (
  pokemonId: number | undefined,
  abilityId: number | undefined,
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "ability",
  pokemonId,
  abilityId,
  isRevoked,
});

const observePosition = (
  pokemonId: number | undefined,
  position: ObservationInput["position"],
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "position",
  pokemonId,
  position,
  isRevoked,
});

const observeMega = (
  pokemonId: number | undefined,
  seq: number,
  isRevoked = false,
): ObservationInput => ({
  seq,
  kind: "mega",
  pokemonId,
  isRevoked,
});

describe("scoreArchetype: SCORE-002 ポケモン一致", () => {
  it("観測0件では0点・最大0点・一致度0%を返す", () => {
    // SCORE-007: 観測0件でも構築内ポケモンは全て「未観測」として likelyUnseen に載る(§7.4)。
    expect(scoreArchetype(createArchetype([createPokemon(1)]), [])).toEqual({
      archetypeId: "archetype-1",
      matchRate: 0,
      rawScore: 0,
      maxScore: 0,
      matched: [],
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 1, usageRate: 1 }],
      threatMoveIds: [],
    });
  });

  it("1体一致で +pokemonHit × usageRate を加点し、観測1件分の最大点を積む", () => {
    const result = scoreArchetype(createArchetype([createPokemon(25, 0.6)]), [
      observePokemon(25, 1),
    ]);

    expect(result).toMatchObject({
      rawScore: 6,
      maxScore: 10,
      matchRate: 60,
      matched: [
        {
          observationSeq: 1,
          kind: "pokemon",
          matched: true,
          points: 6,
          pokemonId: 25,
        },
      ],
    });
  });

  it("複数観測の完全一致を100%として計算する", () => {
    const pokemons = Array.from({ length: 6 }, (_, index) => createPokemon(index + 1));
    const observations = pokemons.map((pokemon, index) =>
      observePokemon(pokemon.pokemonId, index + 1),
    );

    const result = scoreArchetype(createArchetype(pokemons), observations);

    expect(result.rawScore).toBe(60);
    expect(result.maxScore).toBe(60);
    expect(result.matchRate).toBe(100);
    expect(result.matched.every((detail) => detail.matched)).toBe(true);
  });

  it("一部一致では未観測の構築ポケモンを減点せず、観測された不一致だけを減点する", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1), createPokemon(2, 0.5), createPokemon(3)]),
      [observePokemon(1, 1), observePokemon(2, 2), observePokemon(99, 3)],
    );

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 30,
      matchRate: 0,
    });
    expect(result.matched).toEqual([
      {
        observationSeq: 1,
        kind: "pokemon",
        matched: true,
        points: 10,
        pokemonId: 1,
      },
      {
        observationSeq: 2,
        kind: "pokemon",
        matched: true,
        points: 5,
        pokemonId: 2,
      },
      {
        observationSeq: 3,
        kind: "pokemon",
        matched: false,
        points: 0,
        pokemonId: 99,
      },
    ]);
    expect(result.contradictions).toEqual([
      {
        observationSeq: 3,
        kind: "pokemon",
        penaltyPoints: -20,
        contradictionCode: "pokemon_not_in_archetype",
        pokemonId: 99,
      },
    ]);
  });

  it("一致0件では不一致観測の内訳を返し、一致度0%に保つ", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1)]), [
      observePokemon(98, 2),
      observePokemon(99, 1),
    ]);

    expect(result.rawScore).toBe(0);
    expect(result.maxScore).toBe(20);
    expect(result.matchRate).toBe(0);
    expect(result.matched).toEqual([
      {
        observationSeq: 1,
        kind: "pokemon",
        matched: false,
        points: 0,
        pokemonId: 99,
      },
      {
        observationSeq: 2,
        kind: "pokemon",
        matched: false,
        points: 0,
        pokemonId: 98,
      },
    ]);
  });

  it("観測側の同じpokemonIdは最小seqの1件に集約し二重加点しない", () => {
    const result = scoreArchetype(createArchetype([createPokemon(25, 0.8)]), [
      observePokemon(25, 5),
      observePokemon(25, 2),
      observePokemon(25, 3),
    ]);

    expect(result).toMatchObject({
      rawScore: 8,
      maxScore: 10,
      matchRate: 80,
    });
    expect(result.matched).toEqual([
      {
        observationSeq: 2,
        kind: "pokemon",
        matched: true,
        points: 8,
        pokemonId: 25,
      },
    ]);
  });

  it("テンプレ側のpokemonId重複は不正Snapshotとして明示的に拒否する", () => {
    expect(() =>
      scoreArchetype(createArchetype([createPokemon(25), createPokemon(25, 0.5)]), [
        observePokemon(25, 1),
      ]),
    ).toThrowError(/duplicate pokemonId 25/u);
  });

  it("入力配列の順序が異なっても決定的な結果を返す", () => {
    const pokemons = [createPokemon(1, 0.75), createPokemon(2, 0.5)];
    const observations = [observePokemon(99, 3), observePokemon(2, 2), observePokemon(1, 1)];

    const forward = scoreArchetype(createArchetype(pokemons), observations);
    const reversed = scoreArchetype(
      createArchetype([...pokemons].reverse()),
      [...observations].reverse(),
    );

    expect(reversed).toEqual(forward);
    expect(forward.matched.map((detail) => detail.observationSeq)).toEqual([1, 2, 3]);
  });

  it("入力のSnapshotと観測配列を変更しない", () => {
    const archetype = createArchetype([createPokemon(2, 0.5), createPokemon(1)]);
    const observations = [observePokemon(2, 2), observePokemon(1, 1)];
    const archetypeBefore = structuredClone(archetype);
    const observationsBefore = structuredClone(observations);

    scoreArchetype(archetype, observations);

    expect(archetype).toEqual(archetypeBefore);
    expect(observations).toEqual(observationsBefore);
  });

  it("unclassifiedは具体roleとして加点・減点せず、決定性と入力非破壊を維持する", () => {
    const observations = [observePokemon(1, 1), observeMove(1, 10, 2)];
    const concrete = createArchetype([
      { ...createPokemon(1, 1, false, [createMove(10)]), role: "sweeper" },
    ]);
    const unclassified = createArchetype([
      { ...createPokemon(1, 1, false, [createMove(10)]), role: "unclassified" },
    ]);
    const before = structuredClone(unclassified);

    expect(scoreArchetype(unclassified, observations)).toEqual(
      scoreArchetype(concrete, observations),
    );
    expect(scoreArchetype(unclassified, observations)).toEqual(
      scoreArchetype(unclassified, observations),
    );
    expect(unclassified).toEqual(before);
  });

  it("通常形態・別フォルム・メガ形態をpokemonId単位で区別する", () => {
    const normalOnly = scoreArchetype(createArchetype([createPokemon(130, 1, false)]), [
      observePokemon(1_130, 1),
    ]);
    const megaForm = scoreArchetype(createArchetype([createPokemon(1_130, 1, true)]), [
      observePokemon(1_130, 1),
    ]);

    expect(normalOnly).toMatchObject({ rawScore: 0, maxScore: 10, matchRate: 0 });
    expect(normalOnly.matched[0]).toMatchObject({ pokemonId: 1_130, matched: false });
    expect(megaForm).toMatchObject({ rawScore: 10, maxScore: 10, matchRate: 100 });
    expect(megaForm.matched[0]).toMatchObject({ pokemonId: 1_130, matched: true });
  });

  it("is_revokedな観測を計算対象外にする", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1)]), [
      observePokemon(1, 1, true),
      observeItem(1, 10, 2, true),
      observePokemon(1, 3),
    ]);

    expect(result).toMatchObject({ rawScore: 10, maxScore: 10, matchRate: 100 });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.observationSeq).toBe(3);
  });

  it.each([
    ["pokemonIdなしの観測", createArchetype([createPokemon(1)]), [observePokemon(undefined, 1)]],
    ["pokemonId=0の観測", createArchetype([createPokemon(1)]), [observePokemon(0, 1)]],
    ["小数pokemonIdの観測", createArchetype([createPokemon(1)]), [observePokemon(1.5, 1)]],
    ["seq=0の観測", createArchetype([createPokemon(1)]), [observePokemon(1, 0)]],
    ["負のテンプレID", createArchetype([createPokemon(-1)]), []],
    ["範囲外usageRate", createArchetype([createPokemon(1, 1.01)]), []],
    ["非有限usageRate", createArchetype([createPokemon(1, Number.NaN)]), []],
  ])("%sを明示的に拒否する", (_label, archetype, observations) => {
    expect(() => scoreArchetype(archetype, observations)).toThrowError(RangeError);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正なpokemonHit=%sを拒否する",
    (pokemonHit) => {
      expect(() =>
        scoreArchetype(createArchetype([createPokemon(1)]), [observePokemon(1, 1)], {
          ...DEFAULT_SCORING_CONFIG,
          pokemonHit,
        }),
      ).toThrowError(RangeError);
    },
  );

  it("小数のusageRateを安定した精度で返し、スコアを下限0・上限max/100内に保つ", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 0.3333), createPokemon(2, 0)]),
      [observePokemon(1, 1), observePokemon(2, 2)],
    );

    expect(result).toMatchObject({
      rawScore: 3.333,
      maxScore: 20,
      matchRate: 16.665,
    });
    expect(result.rawScore).toBeGreaterThanOrEqual(0);
    expect(result.rawScore).toBeLessThanOrEqual(result.maxScore);
    expect(result.matchRate).toBeGreaterThanOrEqual(0);
    expect(result.matchRate).toBeLessThanOrEqual(100);
  });

  it("pokemonHit=0でもNaNを返さず、上下限内に保つ", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1)]), [observePokemon(1, 1)], {
      ...DEFAULT_SCORING_CONFIG,
      pokemonHit: 0,
    });

    expect(result).toMatchObject({ rawScore: 0, maxScore: 0, matchRate: 0 });
  });

  it("同じ入力では内訳を含む同じ結果を返し、SCORE-001の型契約を満たす", () => {
    const archetype = createArchetype([createPokemon(1, 0.75)]);
    const observations = [observePokemon(1, 2), observePokemon(99, 1)];
    const first: ScoredCandidate = scoreArchetype(archetype, observations);
    const second = scoreArchetype(archetype, observations);

    expect(second).toEqual(first);
    expectTypeOf(first).toEqualTypeOf<ScoredCandidate>();
    expectTypeOf<Parameters<typeof scoreArchetype>>().toEqualTypeOf<
      [ArchetypeSnapshot, readonly ObservationInput[], typeof DEFAULT_SCORING_CONFIG?]
    >();
  });
});

describe("scoreArchetype: SCORE-003 技一致", () => {
  it("技観測0件ではSCORE-002のポケモンスコアだけを返す", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 0.5, false, [createMove(10)])]),
      [observePokemon(1, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 5,
      maxScore: 10,
      matchRate: 50,
    });
    expect(result.matched).toEqual([
      {
        observationSeq: 1,
        kind: "pokemon",
        matched: true,
        points: 5,
        pokemonId: 1,
      },
    ]);
  });

  it("対象ポケモンの確定採用技1件へ +moveHit を加点する", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1),
    ]);

    expect(result).toMatchObject({
      rawScore: 15,
      maxScore: 15,
      matchRate: 100,
      matched: [
        {
          observationSeq: 1,
          kind: "move",
          matched: true,
          points: 15,
          pokemonId: 1,
          moveId: 10,
        },
      ],
    });
  });

  it("複数技のadoptionRateを個別に反映する", () => {
    const result = scoreArchetype(
      createArchetype([
        createPokemon(1, 1, false, [createMove(10), createMove(11, 0.5)]),
        createPokemon(2, 1, false, [createMove(20, 0.25)]),
      ]),
      [observeMove(2, 20, 3), observeMove(1, 11, 2), observeMove(1, 10, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 26.25,
      maxScore: 45,
      matchRate: 58.333333,
    });
    expect(result.matched.map((detail) => detail.points)).toEqual([15, 7.5, 3.75]);
  });

  it("一部一致では一致技の加点と対象ポケモンの技矛盾減点を合成する", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1),
      observeMove(1, 99, 2),
    ]);

    expect(result).toMatchObject({
      rawScore: 3,
      maxScore: 30,
      matchRate: 10,
    });
    expect(result.matched[1]).toEqual({
      observationSeq: 2,
      kind: "move",
      matched: false,
      points: 0,
      pokemonId: 1,
      moveId: 99,
    });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 2,
        kind: "move",
        penaltyPoints: -12,
        contradictionCode: "move_not_in_archetype",
        pokemonId: 1,
        moveId: 99,
      },
    ]);
  });

  it("技一致0件でも負点を付けず一致度0%に保つ", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 98, 2),
      observeMove(99, 10, 1),
    ]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 30,
      matchRate: 0,
    });
    expect(result.matched.every((detail) => !detail.matched && detail.points === 0)).toBe(true);
  });

  it("同一pokemonIdとmoveIdの重複観測を最小seqの1件へ集約する", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 1, false, [createMove(10, 0.5)])]),
      [observeMove(1, 10, 5), observeMove(1, 10, 2), observeMove(1, 10, 3)],
    );

    expect(result).toMatchObject({
      rawScore: 7.5,
      maxScore: 15,
      matchRate: 50,
    });
    expect(result.matched).toEqual([
      {
        observationSeq: 2,
        kind: "move",
        matched: true,
        points: 7.5,
        pokemonId: 1,
        moveId: 10,
      },
    ]);
  });

  it("同じmoveIdでも別ポケモンの観測は別々に評価する", () => {
    const result = scoreArchetype(
      createArchetype([
        createPokemon(1, 1, false, [createMove(10)]),
        createPokemon(2, 1, false, [createMove(10, 0.5)]),
      ]),
      [observeMove(2, 10, 2), observeMove(1, 10, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 22.5,
      maxScore: 30,
      matchRate: 75,
    });
    expect(result.matched.map(({ pokemonId, moveId }) => [pokemonId, moveId])).toEqual([
      [1, 10],
      [2, 10],
    ]);
  });

  it("別ポケモンだけが同じ技を持つ場合は誤一致しない", () => {
    const result = scoreArchetype(
      createArchetype([
        createPokemon(1, 1, false, [createMove(11)]),
        createPokemon(2, 1, false, [createMove(10)]),
      ]),
      [observeMove(1, 10, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 15,
      matchRate: 0,
      matched: [
        {
          observationSeq: 1,
          kind: "move",
          matched: false,
          points: 0,
          pokemonId: 1,
          moveId: 10,
        },
      ],
    });
  });

  it("取消済み技観測を無視する", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1, true),
      observeMove(1, 10, 2),
    ]);

    expect(result).toMatchObject({ rawScore: 15, maxScore: 15, matchRate: 100 });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.observationSeq).toBe(2);
  });

  it("対象ポケモンのkind=pokemon観測がなくても組が一致すれば加点する", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1),
    ]);

    expect(result).toMatchObject({ rawScore: 15, maxScore: 15, matchRate: 100 });
    expect(result.matched.every((detail) => detail.kind === "move")).toBe(true);
  });

  it("テンプレ側の未観測技を最大点や減点へ含めない", () => {
    const result = scoreArchetype(
      createArchetype([
        createPokemon(1, 1, false, [
          createMove(10),
          createMove(11),
          createMove(12),
          createMove(13),
        ]),
      ]),
      [observeMove(1, 10, 1)],
    );

    expect(result).toMatchObject({ rawScore: 15, maxScore: 15, matchRate: 100 });
  });

  it("SCORE-002のポケモン点と技点を合成し、全観測分の最大点を積む", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 0.5, false, [createMove(10, 0.5)])]),
      [observeMove(1, 10, 2), observePokemon(1, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 12.5,
      maxScore: 25,
      matchRate: 50,
    });
    expect(result.matched.map((detail) => detail.kind)).toEqual(["pokemon", "move"]);
  });

  it("観測順とSnapshot内の技順が異なっても決定的な結果を返す", () => {
    const pokemons = [
      createPokemon(1, 1, false, [createMove(10), createMove(11, 0.5)]),
      createPokemon(2, 1, false, [createMove(20)]),
    ];
    const observations = [observeMove(2, 20, 3), observeMove(1, 11, 2), observeMove(1, 10, 1)];

    const forward = scoreArchetype(createArchetype(pokemons), observations);
    const reversed = scoreArchetype(
      createArchetype(
        [...pokemons]
          .reverse()
          .map((pokemon) => ({ ...pokemon, moves: [...pokemon.moves].reverse() })),
      ),
      [...observations].reverse(),
    );

    expect(reversed).toEqual(forward);
    expect(forward.matched.map((detail) => detail.observationSeq)).toEqual([1, 2, 3]);
  });

  it("混在する同一seqの内訳もkindとIDで決定的に並べる", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1),
      observePokemon(1, 1),
    ]);

    expect(result.matched.map((detail) => detail.kind)).toEqual(["pokemon", "move"]);
  });

  it("技を含む入力のSnapshotと観測配列を変更しない", () => {
    const archetype = createArchetype([
      createPokemon(1, 1, false, [createMove(11, 0.5), createMove(10)]),
    ]);
    const observations = [observeMove(1, 11, 2), observeMove(1, 10, 1)];
    const archetypeBefore = structuredClone(archetype);
    const observationsBefore = structuredClone(observations);

    scoreArchetype(archetype, observations);

    expect(archetype).toEqual(archetypeBefore);
    expect(observations).toEqual(observationsBefore);
  });

  it.each([
    ["pokemonIdなし", observeMove(undefined, 10, 1)],
    ["pokemonId=0", observeMove(0, 10, 1)],
    ["小数pokemonId", observeMove(1.5, 10, 1)],
    ["moveIdなし", observeMove(1, undefined, 1)],
    ["moveId=0", observeMove(1, 0, 1)],
    ["小数moveId", observeMove(1, 1.5, 1)],
    ["seq=0", observeMove(1, 10, 0)],
  ])("不正な技観測(%s)を拒否する", (_label, observation) => {
    expect(() =>
      scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
        observation,
      ]),
    ).toThrowError(RangeError);
  });

  it.each([
    ["負のmoveId", createMove(-1)],
    ["小数moveId", createMove(1.5)],
    ["負のadoptionRate", createMove(10, -0.01)],
    ["1超のadoptionRate", createMove(10, 1.01)],
    ["非有限adoptionRate", createMove(10, Number.NaN)],
  ])("不正なテンプレ技(%s)を拒否する", (_label, move) => {
    expect(() =>
      scoreArchetype(createArchetype([createPokemon(1, 1, false, [move])]), []),
    ).toThrowError(RangeError);
  });

  it("同一ポケモン内のmoveId重複は不正Snapshotとして拒否する", () => {
    expect(() =>
      scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [createMove(10), createMove(10, 0.5)])]),
        [observeMove(1, 10, 1)],
      ),
    ).toThrowError(/duplicate moveId 10/u);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("不正なmoveHit=%sを拒否する", (moveHit) => {
    expect(() =>
      scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [createMove(10)])]),
        [observeMove(1, 10, 1)],
        {
          ...DEFAULT_SCORING_CONFIG,
          moveHit,
        },
      ),
    ).toThrowError(RangeError);
  });

  it("小数adoptionRateを安定化し、スコアを下限0・上限max/100内に保つ", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 1, false, [createMove(10, 0.3333)])]),
      [observeMove(1, 10, 1)],
    );

    expect(result).toMatchObject({
      rawScore: 4.9995,
      maxScore: 15,
      matchRate: 33.33,
    });
    expect(result.rawScore).toBeGreaterThanOrEqual(0);
    expect(result.rawScore).toBeLessThanOrEqual(result.maxScore);
    expect(result.matchRate).toBeGreaterThanOrEqual(0);
    expect(result.matchRate).toBeLessThanOrEqual(100);
  });

  it("moveHit=0でもNaNを返さず、上下限内に保つ", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 1, false, [createMove(10)])]),
      [observeMove(1, 10, 1)],
      {
        ...DEFAULT_SCORING_CONFIG,
        moveHit: 0,
      },
    );

    expect(result).toMatchObject({ rawScore: 0, maxScore: 0, matchRate: 0 });
  });
});

describe("scoreArchetype: SCORE-006 持ち物・特性・先発・メガ一致", () => {
  it("追加観測0件では既存のポケモン・技スコアだけを返す", () => {
    const result = scoreArchetype(
      createArchetype([
        createPokemon(1, 0.5, false, [createMove(10, 0.5)], {
          itemId: 20,
          abilityId: 30,
        }),
      ]),
      [observePokemon(1, 1), observeMove(1, 10, 2)],
    );

    expect(result).toMatchObject({
      rawScore: 12.5,
      maxScore: 25,
      matchRate: 50,
    });
    expect(result.matched.map((detail) => detail.kind)).toEqual(["pokemon", "move"]);
  });

  describe("持ち物一致", () => {
    it("対象ポケモンの確定持ち物へ +itemHit を加点する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 0.25, false, [], { itemId: 20 })]),
        [observeItem(1, 20, 1)],
      );

      expect(result).toMatchObject({
        rawScore: 15,
        maxScore: 15,
        matchRate: 100,
        matched: [
          {
            observationSeq: 1,
            kind: "item",
            matched: true,
            points: 15,
            pokemonId: 1,
            itemId: 20,
          },
        ],
      });
    });

    it("対象ポケモンの代替持ち物へ +itemAlternativeHit を加点する", () => {
      const result = scoreArchetype(
        createArchetype([
          createPokemon(1, 1, false, [], {
            itemId: 20,
            itemAlternativeIds: [21, 22],
          }),
        ]),
        [observeItem(1, 21, 1)],
      );

      expect(result).toMatchObject({
        rawScore: 8,
        maxScore: 15,
        matchRate: 53.333333,
      });
      expect(result.matched[0]).toMatchObject({ matched: true, points: 8, itemId: 21 });
    });

    it("不一致持ち物を加点せず、矛盾内訳へ分離する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [], { itemId: 20 })]),
        [observeItem(1, 99, 1)],
      );

      expect(result).toMatchObject({ rawScore: 0, maxScore: 15, matchRate: 0 });
      expect(result.matched[0]).toMatchObject({ matched: false, points: 0 });
      expect(result.contradictions[0]).toMatchObject({
        penaltyPoints: -12,
        contradictionCode: "item_not_in_archetype",
      });
    });

    it("別ポケモンが同じ持ち物を持つだけでは一致にしない", () => {
      const result = scoreArchetype(
        createArchetype([
          createPokemon(1, 1, false, [], { itemId: 21 }),
          createPokemon(2, 1, false, [], { itemId: 20 }),
        ]),
        [observeItem(1, 20, 1)],
      );

      expect(result).toMatchObject({ rawScore: 0, maxScore: 15, matchRate: 0 });
    });

    it("同一pokemonIdとitemIdの重複観測を最小seqの1件へ集約する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [], { itemId: 20 })]),
        [observeItem(1, 20, 5), observeItem(1, 20, 2), observeItem(1, 20, 3)],
      );

      expect(result).toMatchObject({ rawScore: 15, maxScore: 15, matchRate: 100 });
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.observationSeq).toBe(2);
    });
  });

  describe("特性一致", () => {
    it("対象ポケモンの確定特性へ +abilityHit を加点する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 0.25, false, [], { abilityId: 30 })]),
        [observeAbility(1, 30, 1)],
      );

      expect(result).toMatchObject({
        rawScore: 8,
        maxScore: 8,
        matchRate: 100,
        matched: [
          {
            observationSeq: 1,
            kind: "ability",
            matched: true,
            points: 8,
            pokemonId: 1,
            abilityId: 30,
          },
        ],
      });
    });

    it("不一致特性を加点せず、矛盾内訳へ分離する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [], { abilityId: 30 })]),
        [observeAbility(1, 99, 1)],
      );

      expect(result).toMatchObject({ rawScore: 0, maxScore: 8, matchRate: 0 });
      expect(result.matched[0]).toMatchObject({ matched: false, points: 0 });
      expect(result.contradictions[0]).toMatchObject({
        penaltyPoints: -8,
        contradictionCode: "ability_mismatch",
      });
    });

    it("別ポケモンが同じ特性を持つだけでは一致にしない", () => {
      const result = scoreArchetype(
        createArchetype([
          createPokemon(1, 1, false, [], { abilityId: 31 }),
          createPokemon(2, 1, false, [], { abilityId: 30 }),
        ]),
        [observeAbility(1, 30, 1)],
      );

      expect(result).toMatchObject({ rawScore: 0, maxScore: 8, matchRate: 0 });
    });

    it("同一pokemonIdとabilityIdの重複観測を最小seqの1件へ集約する", () => {
      const result = scoreArchetype(
        createArchetype([createPokemon(1, 1, false, [], { abilityId: 30 })]),
        [observeAbility(1, 30, 5), observeAbility(1, 30, 2), observeAbility(1, 30, 3)],
      );

      expect(result).toMatchObject({ rawScore: 8, maxScore: 8, matchRate: 100 });
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.observationSeq).toBe(2);
    });
  });

  describe("先発一致", () => {
    it("defaultLeadSlots先頭のポケモンへ +leadHit を加点する", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1), createPokemon(2)], [2, 1]), [
        observePosition(2, "lead", 1),
      ]);

      expect(result).toMatchObject({
        rawScore: 6,
        maxScore: 6,
        matchRate: 100,
        matched: [
          {
            observationSeq: 1,
            kind: "position",
            matched: true,
            points: 6,
            pokemonId: 2,
            position: "lead",
          },
        ],
      });
    });

    it("複数の先発観測を個別評価し、一部一致を表現する", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1), createPokemon(2)], [2, 1]), [
        observePosition(1, "lead", 2),
        observePosition(2, "lead", 1),
      ]);

      expect(result).toMatchObject({ rawScore: 6, maxScore: 12, matchRate: 50 });
      expect(result.matched.map((detail) => detail.matched)).toEqual([true, false]);
    });

    it("先発不一致を0点とし減点しない", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1), createPokemon(2)], [2, 1]), [
        observePosition(1, "lead", 1),
      ]);

      expect(result).toMatchObject({ rawScore: 0, maxScore: 6, matchRate: 0 });
    });

    it("同じ先発観測を最小seqの1件へ集約する", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1)], [1]), [
        observePosition(1, "lead", 5),
        observePosition(1, "lead", 2),
        observePosition(1, "lead", 3),
      ]);

      expect(result).toMatchObject({ rawScore: 6, maxScore: 6, matchRate: 100 });
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.observationSeq).toBe(2);
    });

    it("back観測は先発一致の配点対象にしない", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1), createPokemon(2)], [1, 2]), [
        observePosition(2, "back", 1),
      ]);

      expect(result).toMatchObject({ rawScore: 0, maxScore: 0, matchRate: 0, matched: [] });
    });

    it("defaultLeadSlotsが空でも推測せず安全に不一致とする", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1)]), [
        observePosition(1, "lead", 1),
      ]);

      expect(result).toMatchObject({ rawScore: 0, maxScore: 6, matchRate: 0 });
      expect(result.matched[0]).toMatchObject({ matched: false, points: 0 });
    });
  });

  describe("メガ一致", () => {
    it("正しいメガ形態IDへ +megaHit を加点する", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1_130, 1, true)]), [
        observeMega(1_130, 1),
      ]);

      expect(result).toMatchObject({
        rawScore: 12,
        maxScore: 12,
        matchRate: 100,
        matched: [
          {
            observationSeq: 1,
            kind: "mega",
            matched: true,
            points: 12,
            pokemonId: 1_130,
          },
        ],
      });
    });

    it("別メガ形態の観測を一致にしない", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1_130, 1, true)]), [
        observeMega(1_006, 1),
      ]);

      expect(result).toMatchObject({ rawScore: 0, maxScore: 12, matchRate: 0 });
    });

    it("通常形態IDだけではメガ一致を加点しない", () => {
      const result = scoreArchetype(createArchetype([createPokemon(130, 1, false)]), [
        observeMega(130, 1),
      ]);

      expect(result).toMatchObject({ rawScore: 0, maxScore: 12, matchRate: 0 });
      expect(result.matched[0]).toMatchObject({ matched: false, points: 0 });
    });

    it("同じメガ形態の重複観測を最小seqの1件へ集約する", () => {
      const result = scoreArchetype(createArchetype([createPokemon(1_130, 1, true)]), [
        observeMega(1_130, 5),
        observeMega(1_130, 2),
        observeMega(1_130, 3),
      ]);

      expect(result).toMatchObject({ rawScore: 12, maxScore: 12, matchRate: 100 });
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.observationSeq).toBe(2);
    });
  });

  it("取消済みの追加観測をすべて無視する", () => {
    const result = scoreArchetype(
      createArchetype(
        [
          createPokemon(1_130, 1, true, [], {
            itemId: 20,
            abilityId: 30,
          }),
        ],
        [1],
      ),
      [
        observeItem(1_130, 20, 1, true),
        observeAbility(1_130, 30, 2, true),
        observePosition(1_130, "lead", 3, true),
        observeMega(1_130, 4, true),
      ],
    );

    expect(result).toMatchObject({ rawScore: 0, maxScore: 0, matchRate: 0, matched: [] });
  });

  it("全加点種別をSCORE-002・003へ合成する", () => {
    const result = scoreArchetype(
      createArchetype(
        [
          createPokemon(1_130, 0.5, true, [createMove(10, 0.5)], {
            itemId: 20,
            abilityId: 30,
          }),
        ],
        [1],
      ),
      [
        observeMega(1_130, 6),
        observePosition(1_130, "lead", 5),
        observeAbility(1_130, 30, 4),
        observeItem(1_130, 20, 3),
        observeMove(1_130, 10, 2),
        observePokemon(1_130, 1),
      ],
    );

    expect(result).toMatchObject({
      rawScore: 53.5,
      maxScore: 66,
      matchRate: 81.060606,
    });
    expect(result.matched.map((detail) => detail.kind)).toEqual([
      "pokemon",
      "move",
      "item",
      "ability",
      "position",
      "mega",
    ]);
  });

  it("観測・Snapshotの順序が異なっても決定的な結果を返す", () => {
    const pokemons = [
      createPokemon(1, 1, false, [], { itemId: 20, abilityId: 30 }),
      createPokemon(2, 1, true, [], { itemId: 21, abilityId: 31 }),
    ];
    const observations = [
      observeMega(2, 6),
      observePosition(2, "lead", 5),
      observeAbility(2, 31, 4),
      observeItem(1, 20, 3),
    ];

    const forward = scoreArchetype(createArchetype(pokemons, [2, 1]), observations);
    const reversed = scoreArchetype(
      createArchetype([...pokemons].reverse(), [1, 2]),
      [...observations].reverse(),
    );

    expect(reversed).toEqual(forward);
    expect(forward.matched.map((detail) => detail.observationSeq)).toEqual([3, 4, 5, 6]);
  });

  it("同一seqの全内訳をkindとIDで決定的に並べる", () => {
    const result = scoreArchetype(
      createArchetype(
        [
          createPokemon(1, 1, true, [createMove(10)], {
            itemId: 20,
            abilityId: 30,
          }),
        ],
        [1],
      ),
      [
        observeMega(1, 1),
        observePosition(1, "lead", 1),
        observeAbility(1, 30, 1),
        observeItem(1, 20, 1),
        observeMove(1, 10, 1),
        observePokemon(1, 1),
      ],
    );

    expect(result.matched.map((detail) => detail.kind)).toEqual([
      "pokemon",
      "move",
      "item",
      "ability",
      "position",
      "mega",
    ]);
  });

  it("追加観測を含む入力配列とSnapshotを変更しない", () => {
    const archetype = createArchetype(
      [
        createPokemon(1, 1, true, [], {
          itemId: 20,
          itemAlternativeIds: [21],
          abilityId: 30,
        }),
      ],
      [1],
    );
    const observations = [
      observeMega(1, 4),
      observePosition(1, "lead", 3),
      observeAbility(1, 30, 2),
      observeItem(1, 21, 1),
    ];
    const archetypeBefore = structuredClone(archetype);
    const observationsBefore = structuredClone(observations);

    scoreArchetype(archetype, observations);

    expect(archetype).toEqual(archetypeBefore);
    expect(observations).toEqual(observationsBefore);
  });

  it.each([
    ["itemのpokemonIdなし", observeItem(undefined, 20, 1)],
    ["itemIdなし", observeItem(1, undefined, 1)],
    ["itemId=0", observeItem(1, 0, 1)],
    ["abilityのpokemonIdなし", observeAbility(undefined, 30, 1)],
    ["abilityIdなし", observeAbility(1, undefined, 1)],
    ["abilityIdが小数", observeAbility(1, 1.5, 1)],
    ["positionのpokemonIdなし", observePosition(undefined, "lead", 1)],
    ["positionなし", observePosition(1, undefined, 1)],
    ["不正position", observePosition(1, "invalid" as ObservationInput["position"], 1)],
    ["megaのpokemonIdなし", observeMega(undefined, 1)],
    ["megaのpokemonId=0", observeMega(0, 1)],
  ])("不正な追加観測(%s)を拒否する", (_label, observation) => {
    expect(() => scoreArchetype(createArchetype([createPokemon(1)]), [observation])).toThrowError(
      RangeError,
    );
  });

  it.each([
    ["不正itemId", createArchetype([createPokemon(1, 1, false, [], { itemId: 0 })])],
    ["不正abilityId", createArchetype([createPokemon(1, 1, false, [], { abilityId: 0 })])],
    [
      "不正な代替持ち物ID",
      createArchetype([createPokemon(1, 1, false, [], { itemAlternativeIds: [0] })]),
    ],
    [
      "代替持ち物ID重複",
      createArchetype([createPokemon(1, 1, false, [], { itemAlternativeIds: [20, 20] })]),
    ],
    [
      "確定持ち物と代替持ち物の重複",
      createArchetype([createPokemon(1, 1, false, [], { itemId: 20, itemAlternativeIds: [20] })]),
    ],
    [
      "代替持ち物配列の欠落",
      createArchetype([
        {
          ...createPokemon(1),
          itemAlternativeIds: undefined as unknown as number[],
        },
      ]),
    ],
    [
      "isMega欠落",
      createArchetype([
        {
          ...createPokemon(1),
          isMega: undefined as unknown as boolean,
        },
      ]),
    ],
    [
      "slot重複",
      {
        ...createArchetype([createPokemon(1), createPokemon(2)]),
        pokemons: [
          { ...createPokemon(1), slot: 1 },
          { ...createPokemon(2), slot: 1 },
        ],
      },
    ],
    ["存在しない基本選出slot", createArchetype([createPokemon(1)], [2])],
    ["基本選出slot重複", createArchetype([createPokemon(1)], [1, 1])],
    [
      "基本選出配列の欠落",
      {
        ...createArchetype([createPokemon(1)]),
        defaultLeadSlots: undefined as unknown as number[],
      },
    ],
  ])("不正Snapshot(%s)を拒否する", (_label, archetype) => {
    expect(() => scoreArchetype(archetype, [])).toThrowError(RangeError);
  });

  it.each(["itemHit", "itemAlternativeHit", "abilityHit", "leadHit", "megaHit"] as const)(
    "不正なconfig.%sを拒否する",
    (weight) => {
      expect(() =>
        scoreArchetype(createArchetype([createPokemon(1)]), [], {
          ...DEFAULT_SCORING_CONFIG,
          [weight]: Number.NaN,
        }),
      ).toThrowError(RangeError);
    },
  );

  it("小数配点を安定化し、rawScoreとmatchRateを上下限内に保つ", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1, 1, false, [], { itemId: 20, itemAlternativeIds: [99] })]),
      [observeItem(1, 20, 1), observeItem(1, 99, 2)],
      {
        ...DEFAULT_SCORING_CONFIG,
        itemHit: 1.3333333,
        itemAlternativeHit: 0.6666667,
      },
    );

    expect(result).toMatchObject({
      rawScore: 2,
      maxScore: 2.666667,
      matchRate: 74.999991,
    });
    expect(result.rawScore).toBeGreaterThanOrEqual(0);
    expect(result.rawScore).toBeLessThanOrEqual(result.maxScore);
    expect(result.matchRate).toBeGreaterThanOrEqual(0);
    expect(result.matchRate).toBeLessThanOrEqual(100);
  });
});

describe("scoreArchetype: SCORE-004 矛盾・除外判定", () => {
  const archetypeWithKnownSet = () =>
    createArchetype(
      [
        createPokemon(1, 1, false, [createMove(10)], {
          itemId: 20,
          itemAlternativeIds: [21],
          abilityId: 30,
        }),
        createPokemon(2, 1, true, [createMove(11)], {
          itemId: 22,
          abilityId: 31,
        }),
      ],
      [1, 2],
    );

  it("矛盾観測0件では減点・除外理由を返さない", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(1, 1),
      observeMove(1, 10, 2),
      observeItem(1, 21, 3),
      observeAbility(1, 30, 4),
      observePosition(1, "lead", 5),
      observeMega(2, 6),
    ]);

    expect(result).toMatchObject({
      rawScore: 59,
      maxScore: 66,
      matchRate: 89.393939,
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
    });
  });

  it("構築にないポケモン観測へ -pokemonMiss を一度適用する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(1, 1),
      observePokemon(99, 2),
    ]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 20,
      matchRate: 0,
      excluded: false,
    });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 2,
        kind: "pokemon",
        penaltyPoints: -20,
        contradictionCode: "pokemon_not_in_archetype",
        pokemonId: 99,
      },
    ]);
  });

  it("対象ポケモンにない技観測へ -moveConflict を適用する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observeItem(1, 20, 1),
      observeMove(1, 99, 2),
    ]);

    expect(result).toMatchObject({ rawScore: 3, maxScore: 30, matchRate: 10 });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 2,
        kind: "move",
        penaltyPoints: -12,
        contradictionCode: "move_not_in_archetype",
        pokemonId: 1,
        moveId: 99,
      },
    ]);
  });

  it("定番・代替のどちらにもない持ち物観測へ -itemConflict を適用する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observeMove(1, 10, 1),
      observeItem(1, 99, 2),
    ]);

    expect(result).toMatchObject({ rawScore: 3, maxScore: 30, matchRate: 10 });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 2,
        kind: "item",
        penaltyPoints: -12,
        contradictionCode: "item_not_in_archetype",
        pokemonId: 1,
        itemId: 99,
      },
    ]);
  });

  it("確定特性と異なる特性観測へ -abilityConflict を適用する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(1, 1),
      observeAbility(1, 99, 2),
    ]);

    expect(result).toMatchObject({
      rawScore: 2,
      maxScore: 18,
      matchRate: 11.111111,
    });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 2,
        kind: "ability",
        penaltyPoints: -8,
        contradictionCode: "ability_mismatch",
        pokemonId: 1,
        abilityId: 99,
      },
    ]);
  });

  it("先発不一致は仕様どおり0点だけとし、矛盾減点へ含めない", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [observePosition(2, "lead", 1)]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 6,
      matchRate: 0,
      contradictions: [],
      excluded: false,
    });
    expect(result.matched[0]).toMatchObject({
      kind: "position",
      matched: false,
      points: 0,
    });
  });

  it("構築にないメガ形態観測へ -megaConflict を適用し候補を除外する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [observeMega(99, 1)]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 12,
      matchRate: 0,
      excluded: true,
      exclusionCodes: ["mega_conflict"],
    });
    expect(result.contradictions).toEqual([
      {
        observationSeq: 1,
        kind: "mega",
        penaltyPoints: -25,
        contradictionCode: "mega_not_in_archetype",
        pokemonId: 99,
      },
    ]);
  });

  it("通常形態へのメガ観測もメガ矛盾とし、通常形態から派生先を推測しない", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [observeMega(1, 1)]);

    expect(result).toMatchObject({
      rawScore: 0,
      excluded: true,
      exclusionCodes: ["mega_conflict"],
    });
    expect(result.contradictions[0]).toMatchObject({
      contradictionCode: "mega_not_in_archetype",
      pokemonId: 1,
    });
  });

  it("対象ポケモン不在の従属観測と未設定特性は判定不能として二重減点しない", () => {
    const archetype = createArchetype([createPokemon(1)]);
    const result = scoreArchetype(archetype, [
      observePokemon(99, 1),
      observeMove(99, 10, 2),
      observeItem(99, 20, 3),
      observeAbility(99, 30, 4),
      observeAbility(1, 30, 5),
    ]);

    expect(result.contradictions).toEqual([
      {
        observationSeq: 1,
        kind: "pokemon",
        penaltyPoints: -20,
        contradictionCode: "pokemon_not_in_archetype",
        pokemonId: 99,
      },
    ]);
    expect(result.matched.slice(1).every((detail) => !detail.matched && detail.points === 0)).toBe(
      true,
    );
  });

  it("異なる矛盾を仕様どおり累積し、maxScoreは観測の理論最大点のまま維持する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(1, 1),
      observeMove(1, 99, 2),
      observeItem(1, 99, 3),
      observeAbility(1, 99, 4),
    ]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 48,
      matchRate: 0,
      excluded: false,
    });
    expect(result.contradictions.map((detail) => detail.penaltyPoints)).toEqual([-12, -12, -8]);
  });

  it("同一内容の重複観測は最小seqの1件へ集約し二重減点しない", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(99, 5),
      observePokemon(99, 2),
      observeMove(1, 99, 6),
      observeMove(1, 99, 3),
      observeItem(1, 99, 7),
      observeItem(1, 99, 4),
    ]);

    expect(result.contradictions).toHaveLength(3);
    expect(result.contradictions.map((detail) => detail.observationSeq)).toEqual([2, 3, 4]);
    expect(result.contradictions.map((detail) => detail.penaltyPoints)).toEqual([-20, -12, -12]);
  });

  it("取消済みの矛盾観測を減点・除外判定から除外する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(99, 1, true),
      observeMove(1, 99, 2, true),
      observeItem(1, 99, 3, true),
      observeAbility(1, 99, 4, true),
      observeMega(99, 5, true),
    ]);

    expect(result).toMatchObject({
      rawScore: 0,
      maxScore: 0,
      matchRate: 0,
      matched: [],
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
    });
  });

  it("一致観測へ減点を適用しない", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(1, 1),
      observeMove(1, 10, 2),
      observeItem(1, 20, 3),
      observeItem(1, 21, 4),
      observeAbility(1, 30, 5),
      observeMega(2, 6),
    ]);

    expect(result.contradictions).toEqual([]);
    expect(result.excluded).toBe(false);
  });

  it("ポケモン不一致が閾値未満では除外せず、ちょうど閾値で除外する", () => {
    const belowThreshold = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(98, 1),
      observePokemon(99, 2),
    ]);
    const atThreshold = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(97, 3),
      observePokemon(98, 1),
      observePokemon(99, 2),
    ]);

    expect(belowThreshold).toMatchObject({ excluded: false, exclusionCodes: [] });
    expect(atThreshold).toMatchObject({
      excluded: true,
      exclusionCodes: ["pokemon_miss_threshold"],
    });
    expect(atThreshold.contradictions).toHaveLength(3);
  });

  it("複数の除外条件を仕様順で返し、除外後も診断内訳を保持する", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(97, 1),
      observeMega(99, 4),
      observePokemon(98, 2),
      observePokemon(99, 3),
    ]);

    expect(result).toMatchObject({
      rawScore: 0,
      excluded: true,
      exclusionCodes: ["pokemon_miss_threshold", "mega_conflict"],
    });
    expect(result.contradictions).toHaveLength(4);
    expect(result.matched).toHaveLength(4);
  });

  it("観測・Snapshotの順序が異なっても減点と内訳を決定的に返し、入力を変更しない", () => {
    const archetype = archetypeWithKnownSet();
    const observations = [
      observeMega(99, 5),
      observeAbility(1, 99, 4),
      observeItem(1, 99, 3),
      observeMove(1, 99, 2),
      observePokemon(99, 1),
    ];
    const archetypeBefore = structuredClone(archetype);
    const observationsBefore = structuredClone(observations);

    const forward = scoreArchetype(archetype, observations);
    const reversed = scoreArchetype(
      {
        ...archetype,
        pokemons: [...archetype.pokemons].reverse(),
      },
      [...observations].reverse(),
    );

    expect(reversed).toEqual(forward);
    expect(forward.contradictions.map((detail) => detail.observationSeq)).toEqual([1, 2, 3, 4, 5]);
    expect(archetype).toEqual(archetypeBefore);
    expect(observations).toEqual(observationsBefore);
  });

  it("減点前合計が負でもrawScoreを0、matchRateを0〜100へclampする", () => {
    const result = scoreArchetype(archetypeWithKnownSet(), [
      observePokemon(99, 1),
      observeMove(1, 99, 2),
    ]);

    expect(result).toMatchObject({ rawScore: 0, maxScore: 25, matchRate: 0 });
    expect(result.rawScore).toBeGreaterThanOrEqual(0);
    expect(result.rawScore).toBeLessThanOrEqual(result.maxScore);
    expect(result.matchRate).toBeGreaterThanOrEqual(0);
    expect(result.matchRate).toBeLessThanOrEqual(100);
  });

  it.each([
    "pokemonMiss",
    "moveConflict",
    "itemConflict",
    "abilityConflict",
    "megaConflict",
  ] as const)("不正なconfig.%sを拒否する", (weight) => {
    expect(() =>
      scoreArchetype(archetypeWithKnownSet(), [], {
        ...DEFAULT_SCORING_CONFIG,
        [weight]: Number.NaN,
      }),
    ).toThrowError(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正なconfig.excludeMissCount=%sを拒否する",
    (excludeMissCount) => {
      expect(() =>
        scoreArchetype(archetypeWithKnownSet(), [], {
          ...DEFAULT_SCORING_CONFIG,
          excludeMissCount,
        }),
      ).toThrowError(RangeError);
    },
  );

  it("SCORE-001の拡張型契約を満たし、矛盾・除外の識別子を型安全に返す", () => {
    const result: ScoredCandidate = scoreArchetype(archetypeWithKnownSet(), [observeMega(99, 1)]);

    expectTypeOf(result).toEqualTypeOf<ScoredCandidate>();
    expect(result.contradictions[0]?.contradictionCode).toBe("mega_not_in_archetype");
    expect(result.exclusionCodes).toEqual(["mega_conflict"]);
  });

  it("付録Aの表と§7.2の最大点定義を適用すると56/56=100%になる", () => {
    const archetype = createArchetype(
      [
        createPokemon(450, 1, false, [createMove(446)]),
        createPokemon(887, 1, false, [createMove(113)]),
        createPokemon(1_130, 1, true),
        createPokemon(1_000),
        createPokemon(730),
        createPokemon(149),
      ],
      [1],
    );
    const result = scoreArchetype(archetype, [
      observePokemon(450, 1),
      observePosition(450, "lead", 2),
      observeMove(450, 446, 3),
      observePokemon(887, 4),
      observeMove(887, 113, 5),
    ]);

    expect(result).toMatchObject({
      rawScore: 56,
      maxScore: 56,
      matchRate: 100,
      contradictions: [],
      excluded: false,
    });
  });
});

const taggedMove = (
  moveId: number,
  tags: readonly ArchetypeMoveSnapshot["tags"][number][],
  adoptionRate = 1,
): ArchetypeMoveSnapshot => ({
  moveId,
  adoptionRate,
  tags: [...tags],
});

describe("scoreArchetype: SCORE-007 表示要素の算出", () => {
  describe("likelyUnseen(残りの可能性が高いポケモン §7.4)", () => {
    it("構築内の未観測ポケモンを usage_rate 降順で返す", () => {
      const archetype = createArchetype([
        createPokemon(10, 0.3),
        createPokemon(20, 0.9),
        createPokemon(30, 0.6),
      ]);

      const result = scoreArchetype(archetype, []);

      expect(result.likelyUnseen).toEqual([
        { pokemonId: 20, usageRate: 0.9 },
        { pokemonId: 30, usageRate: 0.6 },
        { pokemonId: 10, usageRate: 0.3 },
      ]);
    });

    it("usage_rate 同値は pokemonId 昇順で決定的に整列する", () => {
      const archetype = createArchetype([
        createPokemon(30, 0.5),
        createPokemon(10, 0.5),
        createPokemon(20, 0.5),
      ]);

      expect(scoreArchetype(archetype, []).likelyUnseen.map((p) => p.pokemonId)).toEqual([
        10, 20, 30,
      ]);
    });

    it("観測済み(kind=pokemon)のポケモンは除外する", () => {
      const archetype = createArchetype([
        createPokemon(10, 0.9),
        createPokemon(20, 0.8),
        createPokemon(30, 0.7),
      ]);

      const result = scoreArchetype(archetype, [observePokemon(20, 1)]);

      expect(result.likelyUnseen.map((p) => p.pokemonId)).toEqual([10, 30]);
    });

    it("Undo(取消)された観測は未観測として扱い likelyUnseen に残す", () => {
      const archetype = createArchetype([createPokemon(10, 0.9), createPokemon(20, 0.8)]);

      const result = scoreArchetype(archetype, [observePokemon(20, 1, true)]);

      expect(result.likelyUnseen.map((p) => p.pokemonId)).toEqual([10, 20]);
    });

    it("構築に存在しないポケモンの観測は likelyUnseen に影響しない", () => {
      const archetype = createArchetype([createPokemon(10, 0.9), createPokemon(20, 0.8)]);

      const result = scoreArchetype(archetype, [observePokemon(999, 1)]);

      expect(result.likelyUnseen.map((p) => p.pokemonId)).toEqual([10, 20]);
    });

    it("全ポケモンが観測済みなら空配列を返す", () => {
      const archetype = createArchetype([createPokemon(10), createPokemon(20)]);

      const result = scoreArchetype(archetype, [observePokemon(10, 1), observePokemon(20, 2)]);

      expect(result.likelyUnseen).toEqual([]);
    });
  });

  describe("threatMoveIds(警戒すべき技 §7.4)", () => {
    it("警戒タグ(setup/hazard/screen/priority)を持つ未観測技のみ返す", () => {
      const archetype = createArchetype([
        createPokemon(1, 1, false, [
          taggedMove(100, ["hazard"]),
          taggedMove(101, []),
          taggedMove(102, ["setup"], 0.5),
        ]),
      ]);

      const result = scoreArchetype(archetype, []);

      // usage 同値 → adoption 降順(100:1.0 → 102:0.5)。101 は無タグで除外。
      expect(result.threatMoveIds).toEqual([100, 102]);
    });

    it.each([
      ["setup", ["setup"] as const],
      ["hazard", ["hazard"] as const],
      ["screen", ["screen"] as const],
      ["priority", ["priority"] as const],
    ])("警戒タグ %s を含む技を対象にする", (_label, tags) => {
      const archetype = createArchetype([createPokemon(1, 1, false, [taggedMove(100, tags)])]);

      expect(scoreArchetype(archetype, []).threatMoveIds).toEqual([100]);
    });

    it.each([
      ["pivot", ["pivot"] as const],
      ["status", ["status"] as const],
    ])("§7.4 対象外のタグ %s のみの技は含めない", (_label, tags) => {
      const archetype = createArchetype([createPokemon(1, 1, false, [taggedMove(100, tags)])]);

      expect(scoreArchetype(archetype, []).threatMoveIds).toEqual([]);
    });

    it("観測済み(pokemon,move)の技は除外し、同ポケモンの未観測技は残す", () => {
      const archetype = createArchetype([
        createPokemon(1, 1, false, [taggedMove(100, ["hazard"]), taggedMove(101, ["setup"])]),
      ]);

      const result = scoreArchetype(archetype, [observePokemon(1, 1), observeMove(1, 100, 2)]);

      expect(result.threatMoveIds).toEqual([101]);
    });

    it("未観測ポケモンの技は観測済み技IDと同じでも保有元が異なれば残す", () => {
      const archetype = createArchetype([
        createPokemon(1, 0.9, false, [taggedMove(100, ["hazard"])]),
        createPokemon(2, 0.9, false, [taggedMove(100, ["hazard"])]),
      ]);

      // (1,100) は観測済みだが (2,100) は未観測 → 技100は警戒対象として残る。
      const result = scoreArchetype(archetype, [observePokemon(1, 1), observeMove(1, 100, 2)]);

      expect(result.threatMoveIds).toEqual([100]);
    });

    it("同一技IDは重複排除する", () => {
      const archetype = createArchetype([
        createPokemon(1, 0.5, false, [taggedMove(200, ["screen"], 0.4)]),
        createPokemon(2, 0.9, false, [taggedMove(200, ["screen"], 0.7)]),
      ]);

      expect(scoreArchetype(archetype, []).threatMoveIds).toEqual([200]);
    });

    it("保有ポケモンの usage_rate 降順 → adoption_rate 降順 → moveId 昇順で整列する", () => {
      const archetype = createArchetype([
        createPokemon(1, 0.9, false, [taggedMove(300, ["priority"], 0.5)]),
        createPokemon(2, 0.5, false, [
          taggedMove(302, ["hazard"], 1),
          taggedMove(301, ["hazard"], 1),
        ]),
      ]);

      // usage: 300(0.9) 先頭。302/301 は usage=0.5・adoption=1.0 同値 → moveId 昇順。
      expect(scoreArchetype(archetype, []).threatMoveIds).toEqual([300, 301, 302]);
    });

    it("Undo された技観測は未観測として警戒対象に残す", () => {
      const archetype = createArchetype([
        createPokemon(1, 1, false, [taggedMove(100, ["hazard"])]),
      ]);

      const result = scoreArchetype(archetype, [
        observePokemon(1, 1),
        observeMove(1, 100, 2, true),
      ]);

      expect(result.threatMoveIds).toEqual([100]);
    });

    it("警戒タグを持つ技が無ければ空配列を返す", () => {
      const archetype = createArchetype([
        createPokemon(1, 1, false, [taggedMove(100, []), taggedMove(101, ["pivot"])]),
      ]);

      expect(scoreArchetype(archetype, []).threatMoveIds).toEqual([]);
    });
  });

  describe("決定性・純粋性", () => {
    const buildArchetype = (): ArchetypeSnapshot =>
      createArchetype(
        [
          createPokemon(10, 0.9, false, [taggedMove(100, ["hazard"]), taggedMove(101, ["setup"])]),
          createPokemon(20, 0.6, true, [taggedMove(200, ["screen"], 0.7)]),
          createPokemon(30, 0.3, false, [taggedMove(300, ["priority"], 0.5)]),
        ],
        [1],
      );

    it("観測列の順序を入れ替えても同じ likelyUnseen / threatMoveIds を返す", () => {
      const archetype = buildArchetype();
      const forward = scoreArchetype(archetype, [
        observePokemon(10, 1),
        observeMove(10, 100, 2),
        observePokemon(20, 3),
      ]);
      const reversed = scoreArchetype(archetype, [
        observePokemon(20, 3),
        observeMove(10, 100, 2),
        observePokemon(10, 1),
      ]);

      expect(reversed.likelyUnseen).toEqual(forward.likelyUnseen);
      expect(reversed.threatMoveIds).toEqual(forward.threatMoveIds);
      expect(forward.likelyUnseen.map((p) => p.pokemonId)).toEqual([30]);
      expect(forward.threatMoveIds).toEqual([101, 200, 300]);
    });

    it("入力の archetype / observations を変更しない", () => {
      const archetype = buildArchetype();
      const observations: ObservationInput[] = [observePokemon(10, 1), observeMove(10, 101, 2)];
      const archetypeBefore = structuredClone(archetype);
      const observationsBefore = structuredClone(observations);

      scoreArchetype(archetype, observations);

      expect(archetype).toEqual(archetypeBefore);
      expect(observations).toEqual(observationsBefore);
    });
  });
});

describe("rankCandidates: SCORE-005 人気度を含む並び替え", () => {
  const createScoredCandidate = (
    archetypeId: string,
    overrides: Partial<Omit<ScoredCandidate, "archetypeId">> = {},
  ): ScoredCandidate => ({
    archetypeId,
    matchRate: 50,
    rawScore: 5,
    maxScore: 10,
    matched: [],
    contradictions: [],
    excluded: false,
    exclusionCodes: [],
    likelyUnseen: [],
    threatMoveIds: [],
    ...overrides,
  });

  const createRankingArchetype = (
    id: string,
    overrides: Partial<Omit<ArchetypeSnapshot, "id" | "name">> = {},
  ): ArchetypeSnapshot => ({
    ...createArchetype(),
    id,
    name: id,
    ...overrides,
  });

  const createArchetypeMap = (
    archetypes: readonly ArchetypeSnapshot[],
  ): ReadonlyMap<string, ArchetypeSnapshot> =>
    new Map(archetypes.map((archetype) => [archetype.id, archetype]));

  it("matchRateを第一キーとし、人気度が異なる一致度を逆転させない", () => {
    const candidates = [
      createScoredCandidate("popular", { matchRate: 89 }),
      createScoredCandidate("better-match", { matchRate: 90 }),
    ];
    const archetypes = createArchetypeMap([
      createRankingArchetype("popular", { popularityTier: "high", encounterCount: 1_000 }),
      createRankingArchetype("better-match", {
        popularityTier: "low",
        encounterCount: 0,
      }),
    ]);

    expect(rankCandidates(candidates, archetypes, 2).map(({ archetypeId }) => archetypeId)).toEqual(
      ["better-match", "popular"],
    );
  });

  it("同じmatchRateでは手動人気度tierをhigh、mid、lowの順にする", () => {
    const candidates = [
      createScoredCandidate("low", { rawScore: 100, maxScore: 200 }),
      createScoredCandidate("high", { rawScore: 1, maxScore: 2 }),
      createScoredCandidate("mid", { rawScore: 50, maxScore: 100 }),
    ];
    const archetypes = createArchetypeMap([
      createRankingArchetype("low", { popularityTier: "low" }),
      createRankingArchetype("high", { popularityTier: "high" }),
      createRankingArchetype("mid", { popularityTier: "mid" }),
    ]);

    expect(rankCandidates(candidates, archetypes, 3).map(({ archetypeId }) => archetypeId)).toEqual(
      ["high", "mid", "low"],
    );
  });

  it("一致度とtierが同じ場合はencounterCount降順にする", () => {
    const candidates = [
      createScoredCandidate("few"),
      createScoredCandidate("many"),
      createScoredCandidate("none"),
    ];
    const archetypes = createArchetypeMap([
      createRankingArchetype("few", { encounterCount: 2 }),
      createRankingArchetype("many", { encounterCount: 20 }),
      createRankingArchetype("none", { encounterCount: 0 }),
    ]);

    expect(rankCandidates(candidates, archetypes, 3).map(({ archetypeId }) => archetypeId)).toEqual(
      ["many", "few", "none"],
    );
  });

  it("一致度・tier・遭遇数が同じ場合はupdatedAtの新しい順にする", () => {
    const candidates = [
      createScoredCandidate("old"),
      createScoredCandidate("new"),
      createScoredCandidate("middle"),
    ];
    const archetypes = createArchetypeMap([
      createRankingArchetype("old", { updatedAt: "2026-01-01T00:00:00Z" }),
      createRankingArchetype("new", { updatedAt: "2026-03-01T00:00:00+00:00" }),
      createRankingArchetype("middle", { updatedAt: "2026-02-01T09:00:00+09:00" }),
    ]);

    expect(rankCandidates(candidates, archetypes, 3).map(({ archetypeId }) => archetypeId)).toEqual(
      ["new", "middle", "old"],
    );
  });

  it("popularityScoreのnull・未設定・0を順位へ使わず手動tierを正とする", () => {
    const candidateIds = ["d-positive", "c-zero", "b-undefined", "a-null"];
    const candidates = candidateIds.map((id) => createScoredCandidate(id));
    const archetypes = createArchetypeMap([
      createRankingArchetype("d-positive", { popularityScore: 100 }),
      createRankingArchetype("c-zero", { popularityScore: 0 }),
      createRankingArchetype("b-undefined", { popularityScore: undefined }),
      createRankingArchetype("a-null", { popularityScore: null }),
    ]);

    expect(rankCandidates(candidates, archetypes, 4).map(({ archetypeId }) => archetypeId)).toEqual(
      ["a-null", "b-undefined", "c-zero", "d-positive"],
    );
  });

  it("完全同点ではarchetypeId昇順を最終キーとし入力順に依存しない", () => {
    const candidates = ["candidate-c", "candidate-a", "candidate-b"].map((id) =>
      createScoredCandidate(id),
    );
    const archetypes = createArchetypeMap(
      candidates.map(({ archetypeId }) => createRankingArchetype(archetypeId)),
    );
    const expected = ["candidate-a", "candidate-b", "candidate-c"];

    expect(rankCandidates(candidates, archetypes, 3).map(({ archetypeId }) => archetypeId)).toEqual(
      expected,
    );
    expect(
      rankCandidates([...candidates].reverse(), archetypes, 3).map(
        ({ archetypeId }) => archetypeId,
      ),
    ).toEqual(expected);
  });

  it("excluded候補を除外し、limit件へ1始まりの連続rankを付ける", () => {
    const candidates = [
      createScoredCandidate("excluded-best", {
        matchRate: 100,
        excluded: true,
        exclusionCodes: ["mega_conflict"],
      }),
      createScoredCandidate("third", { matchRate: 70 }),
      createScoredCandidate("first", { matchRate: 90 }),
      createScoredCandidate("second", { matchRate: 80 }),
    ];
    const archetypes = createArchetypeMap([
      createRankingArchetype("first"),
      createRankingArchetype("second"),
      createRankingArchetype("third"),
    ]);

    const result = rankCandidates(candidates, archetypes, 2);

    expect(result.map(({ archetypeId, rank }) => ({ archetypeId, rank }))).toEqual([
      { archetypeId: "first", rank: 1 },
      { archetypeId: "second", rank: 2 },
    ]);
    expect(result.every((candidate) => !candidate.excluded)).toBe(true);
  });

  it("候補0件・1件とlimit=0を扱う", () => {
    const candidate = createScoredCandidate("only");
    const archetypes = createArchetypeMap([createRankingArchetype("only")]);

    expect(rankCandidates([], new Map(), 3)).toEqual([]);
    expect(rankCandidates([candidate], archetypes, 0)).toEqual([]);
    expect(rankCandidates([candidate], archetypes, 3)).toEqual([{ ...candidate, rank: 1 }]);
  });

  it("matchRateの0・100と小数を数値として厳密に降順比較する", () => {
    const candidates = [
      createScoredCandidate("zero", { matchRate: 0 }),
      createScoredCandidate("rounded-lower", { matchRate: 50 }),
      createScoredCandidate("hundred", { matchRate: 100 }),
      createScoredCandidate("rounded-higher", { matchRate: 50.000001 }),
    ];
    const archetypes = createArchetypeMap(
      candidates.map(({ archetypeId }) => createRankingArchetype(archetypeId)),
    );

    expect(rankCandidates(candidates, archetypes, 4).map(({ archetypeId }) => archetypeId)).toEqual(
      ["hundred", "rounded-higher", "rounded-lower", "zero"],
    );
  });

  it("入力候補・Snapshot・配列を変更せず新しい候補オブジェクトを返す", () => {
    const candidates = Object.freeze([
      createScoredCandidate("second", { matchRate: 20 }),
      createScoredCandidate("first", { matchRate: 80 }),
    ]);
    const snapshots = [createRankingArchetype("first"), createRankingArchetype("second")] as const;
    const archetypes = createArchetypeMap(snapshots);
    const candidatesBefore = structuredClone(candidates);
    const snapshotsBefore = structuredClone(snapshots);

    const result = rankCandidates(candidates, archetypes, 2);

    expect(candidates).toEqual(candidatesBefore);
    expect(snapshots).toEqual(snapshotsBefore);
    expect(result[0]).not.toBe(candidates[1]);
    expectTypeOf(result).toEqualTypeOf<RankedCandidate[]>();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("不正なlimit=%sを拒否する", (limit) => {
    expect(() => rankCandidates([], new Map(), limit)).toThrowError(RangeError);
  });

  it("候補重複・Snapshot欠落・不正なソート値を明示的に拒否する", () => {
    const candidate = createScoredCandidate("candidate");

    expect(() =>
      rankCandidates(
        [candidate, candidate],
        createArchetypeMap([createRankingArchetype("candidate")]),
        2,
      ),
    ).toThrowError(/duplicate archetypeId/u);
    expect(() => rankCandidates([candidate], new Map(), 1)).toThrowError(/was not found/u);
    expect(() =>
      rankCandidates(
        [{ ...candidate, matchRate: Number.NaN }],
        createArchetypeMap([createRankingArchetype("candidate")]),
        1,
      ),
    ).toThrowError(/matchRate/u);
    expect(() =>
      rankCandidates(
        [candidate],
        createArchetypeMap([
          createRankingArchetype("candidate", {
            popularityTier: "unknown" as ArchetypeSnapshot["popularityTier"],
          }),
        ]),
        1,
      ),
    ).toThrowError(/popularityTier/u);
    expect(() =>
      rankCandidates(
        [candidate],
        createArchetypeMap([createRankingArchetype("candidate", { encounterCount: -1 })]),
        1,
      ),
    ).toThrowError(/encounterCount/u);
    expect(() =>
      rankCandidates(
        [candidate],
        createArchetypeMap([createRankingArchetype("candidate", { updatedAt: "not-a-date" })]),
        1,
      ),
    ).toThrowError(/updatedAt/u);
  });

  it("SCORE-002〜004・006の計算結果を再計算せず付録Aの100%を維持する", () => {
    const archetype = createArchetype(
      [
        createPokemon(450, 1, false, [createMove(446)]),
        createPokemon(887, 1, false, [createMove(113)]),
        createPokemon(1_130, 1, true),
        createPokemon(1_000),
        createPokemon(730),
        createPokemon(149),
      ],
      [1],
    );
    const scored = scoreArchetype(archetype, [
      observePokemon(450, 1),
      observePosition(450, "lead", 2),
      observeMove(450, 446, 3),
      observePokemon(887, 4),
      observeMove(887, 113, 5),
    ]);
    const scoredBefore = structuredClone(scored);

    const result = rankCandidates([scored], createArchetypeMap([archetype]), 1);

    expect(result[0]).toEqual({ ...scored, rank: 1 });
    expect(result[0]).toMatchObject({ rawScore: 56, maxScore: 56, matchRate: 100 });
    expect(scored).toEqual(scoredBefore);
  });
});
