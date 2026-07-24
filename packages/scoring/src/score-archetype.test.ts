import { describe, expect, expectTypeOf, it } from "vitest";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { scoreArchetype } from "./score-archetype";
import type {
  ArchetypeMoveSnapshot,
  ArchetypePokemonSnapshot,
  ArchetypeSnapshot,
  ObservationInput,
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
    expect(scoreArchetype(createArchetype([createPokemon(1)]), [])).toEqual({
      archetypeId: "archetype-1",
      matchRate: 0,
      rawScore: 0,
      maxScore: 0,
      matched: [],
      contradictions: [],
      excluded: false,
      exclusionCodes: [],
      likelyUnseen: [],
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

describe("rankCandidates (SCORE-005 で実装)", () => {
  it.todo("一致度 → 人気度 → 遭遇報告数 → 更新日 の優先順でソートする");
  it.todo("excluded な候補を除外する");
  it.todo("上位 limit 件のみ返し rank を付与する");
});
