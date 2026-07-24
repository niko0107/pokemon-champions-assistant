import { describe, expect, expectTypeOf, it } from "vitest";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { scoreArchetype } from "./score-archetype";
import type {
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
): ArchetypePokemonSnapshot => ({
  slot: pokemonId,
  pokemonId,
  itemAlternativeIds: [],
  role: null,
  usageRate,
  isMega,
  moves: [],
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

  it("is_revokedな観測とポケモン以外の観測を計算対象外にする", () => {
    const result = scoreArchetype(createArchetype([createPokemon(1)]), [
      observePokemon(1, 1, true),
      {
        seq: 2,
        kind: "move",
        pokemonId: 1,
        moveId: 10,
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

describe("scoreArchetype: 後続タスク", () => {
  it.todo("観測技がそのポケモンの技リストにある場合 +moveHit × adoptionRate 加点する");
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
