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
): ArchetypePokemonSnapshot => ({
  slot: pokemonId,
  pokemonId,
  itemAlternativeIds: [],
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
): ArchetypeSnapshot => ({
  id: "archetype-1",
  name: "test",
  popularityTier: "high",
  encounterCount: 0,
  defaultLeadSlots: [],
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

describe("scoreArchetype: SCORE-002 ポケモン一致", () => {
  it("観測0件では0点・最大0点・一致度0%を返す", () => {
    expect(scoreArchetype(createArchetype([createPokemon(1)]), [])).toEqual({
      archetypeId: "archetype-1",
      matchRate: 0,
      rawScore: 0,
      maxScore: 0,
      matched: [],
      excluded: false,
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

  it("一部一致では未観測の構築ポケモンを減点せず、観測数だけを最大点へ積む", () => {
    const result = scoreArchetype(
      createArchetype([createPokemon(1), createPokemon(2, 0.5), createPokemon(3)]),
      [observePokemon(1, 1), observePokemon(2, 2), observePokemon(99, 3)],
    );

    expect(result).toMatchObject({
      rawScore: 15,
      maxScore: 30,
      matchRate: 50,
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

  it("is_revokedな観測と未実装kindの観測を計算対象外にする", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1)]), [
      observePokemon(1, 1, true),
      {
        seq: 2,
        kind: "item",
        pokemonId: 1,
        itemId: 10,
        isRevoked: false,
      },
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
      [observePokemon(1, 1), observePokemon(2, 2), observePokemon(99, 3)],
    );

    expect(result).toMatchObject({
      rawScore: 3.333,
      maxScore: 30,
      matchRate: 11.11,
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

  it("一部一致では一致技だけを加点し、不一致技を減点しない", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1, 1, false, [createMove(10)])]), [
      observeMove(1, 10, 1),
      observeMove(1, 99, 2),
    ]);

    expect(result).toMatchObject({
      rawScore: 15,
      maxScore: 30,
      matchRate: 50,
    });
    expect(result.matched[1]).toEqual({
      observationSeq: 2,
      kind: "move",
      matched: false,
      points: 0,
      pokemonId: 1,
      moveId: 99,
    });
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

describe("scoreArchetype: 後続タスク", () => {
  it.todo("先発位置が default_leads と一致する場合 +leadHit 加点する");
  it.todo("観測ポケモンが構築に存在しない場合 -pokemonMiss 減点する");
  it.todo("構築のそのポケモンにない技を観測した場合 -moveConflict 減点する");
  it.todo("raw_score が負の場合は一致度 0% とする");
  it.todo("ポケモン不一致3体以上で excluded=true とする");
  it.todo("メガ矛盾が発生した場合 excluded=true とする");
  it.todo("付録A の具体例(カバルドン先発+ステロ+ドラパルト+リフレクター)で一致度 89% になる");
});

describe("rankCandidates (SCORE-005 で実装)", () => {
  it.todo("一致度 → 人気度 → 遭遇報告数 → 更新日 の優先順でソートする");
  it.todo("excluded な候補を除外する");
  it.todo("上位 limit 件のみ返し rank を付与する");
});
