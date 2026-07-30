import { Prisma } from "@pokemon-champions/database";
import { describe, expect, it } from "vitest";
import {
  InvalidObservedMoveStateError,
  resolvePriorityOpponentPokemonIds,
  toArchetypeCounterplanSnapshots,
  toPartyCounterplanCombatants,
  type CounterplanArchetypePokemonRecord,
  type CounterplanMoveRecord,
  type CounterplanObservedMoveRecord,
  type CounterplanPartyPokemonRecord,
} from "./session-counterplan";

const stats = {
  hp: 200,
  attack: 120,
  defense: 110,
  specialAttack: 150,
  specialDefense: 130,
  speed: 100,
};

function move(overrides: Partial<CounterplanMoveRecord> = {}): CounterplanMoveRecord {
  return {
    type: "water",
    category: "special",
    power: 90,
    accuracy: 100,
    priority: 0,
    tags: [],
    ...overrides,
  };
}

function partyPokemon(
  overrides: Partial<CounterplanPartyPokemonRecord> = {},
): CounterplanPartyPokemonRecord {
  return {
    slot: 1,
    pokemonId: 1,
    actualStats: stats,
    pokemon: {
      type1: "water",
      type2: "fairy",
      isMega: false,
    },
    moves: [{ slot: 1, moveId: 11, move: move() }],
    ...overrides,
  };
}

function archetypePokemon(
  overrides: Partial<CounterplanArchetypePokemonRecord> = {},
): CounterplanArchetypePokemonRecord {
  return {
    slot: 1,
    pokemonId: 101,
    role: "sweeper",
    usageRate: new Prisma.Decimal("0.8"),
    actualStats: stats,
    threatNotes: "積み展開に注意",
    pokemon: {
      type1: "dragon",
      type2: null,
      isMega: false,
    },
    moves: [
      {
        moveId: 21,
        adoptionRate: new Prisma.Decimal("0.9"),
        move: move({ type: "dragon", category: "physical", tags: ["setup"] }),
      },
    ],
    ...overrides,
  };
}

function observedMove(
  seq: number,
  moveId: number,
  overrides: Partial<CounterplanObservedMoveRecord> = {},
): CounterplanObservedMoveRecord {
  return {
    seq,
    pokemonId: 101,
    moveId,
    move: move({ type: "dark", category: "status", power: null, tags: ["status"] }),
    ...overrides,
  };
}

describe("Party counterplan Snapshot変換", () => {
  it("Rule.battleLevel、actualStats、Pokemonタイプ、Party技を変換する", () => {
    const [member] = toPartyCounterplanCombatants([partyPokemon()], 37);

    expect(member).toMatchObject({
      level: 37,
      combatant: {
        pokemonId: 1,
        types: ["water", "fairy"],
        stats: {
          hp: 200,
          atk: 120,
          def: 110,
          spa: 150,
          spd: 130,
          spe: 100,
        },
        role: null,
        moves: [
          {
            moveId: 11,
            type: "water",
            category: "special",
            power: 90,
            adoptionRate: 1,
          },
        ],
      },
    });
  });

  it.each([
    ["null", null],
    ["不足キー", { hp: 100 }],
    ["不正値", { ...stats, attack: 0 }],
    ["不正JSON", ["not", "an", "object"]],
  ])("actualStatsが%sなら推測せず拒否する", (_label, actualStats) => {
    expect(() => toPartyCounterplanCombatants([partyPokemon({ actualStats })], 50)).toThrow(
      RangeError,
    );
  });

  it("Move ID・slot重複を拒否し、status技とpower nullを保持する", () => {
    const status = partyPokemon({
      moves: [
        {
          slot: 1,
          moveId: 12,
          move: move({ category: "status", power: null, tags: ["status"] }),
        },
      ],
    });
    expect(toPartyCounterplanCombatants([status], 50)[0]?.combatant.moves[0]).toMatchObject({
      category: "status",
      power: null,
      tags: ["status"],
    });

    const duplicate = partyPokemon({
      moves: [
        { slot: 1, moveId: 11, move: move() },
        { slot: 2, moveId: 11, move: move() },
      ],
    });
    expect(() => toPartyCounterplanCombatants([duplicate], 50)).toThrow(RangeError);
  });
});

describe("Archetype counterplan Snapshot変換", () => {
  it("Rule.battleLevel、Decimal、actualStats、playstyleNotesを明示的に射影する", () => {
    const result = toArchetypeCounterplanSnapshots(
      [archetypePokemon()],
      [],
      37,
      "  壁から展開する  ",
    );

    expect(result.combatants[0]).toMatchObject({
      level: 37,
      combatant: {
        pokemonId: 101,
        stats: {
          hp: 200,
          atk: 120,
          def: 110,
          spa: 150,
          spd: 130,
          spe: 100,
        },
      },
    });
    expect(result.archetype).toMatchObject({
      playstyleNotes: "  壁から展開する  ",
      pokemons: [
        {
          pokemonId: 101,
          usageRate: 0.8,
          threatNotes: "積み展開に注意",
          moves: [{ moveId: 21, adoptionRate: 0.9 }],
        },
      ],
    });
  });

  it("actualStatsがnullなら補完せずtype-only Snapshotへ変換する", () => {
    const result = toArchetypeCounterplanSnapshots(
      [archetypePokemon({ actualStats: null })],
      [],
      50,
      null,
    );
    expect(result.combatants[0]?.combatant.stats).toBeNull();
  });

  it("不正な非null actualStatsは推測せず拒否する", () => {
    expect(() =>
      toArchetypeCounterplanSnapshots(
        [archetypePokemon({ actualStats: { ...stats, speed: Number.POSITIVE_INFINITY } })],
        [],
        50,
        null,
      ),
    ).toThrow(RangeError);
  });

  it("テンプレ技をadoptionRate降順・moveId昇順で最大4件選ぶ", () => {
    const pokemon = archetypePokemon({
      moves: [
        { moveId: 25, adoptionRate: new Prisma.Decimal("0.8"), move: move() },
        { moveId: 23, adoptionRate: new Prisma.Decimal("0.9"), move: move() },
        { moveId: 22, adoptionRate: new Prisma.Decimal("0.9"), move: move() },
        { moveId: 24, adoptionRate: new Prisma.Decimal("0.8"), move: move() },
        { moveId: 21, adoptionRate: new Prisma.Decimal("1"), move: move() },
      ],
    });

    expect(
      toArchetypeCounterplanSnapshots([pokemon], [], 50, null).combatants[0]?.combatant.moves.map(
        ({ moveId }) => moveId,
      ),
    ).toEqual([21, 22, 23, 24]);
  });

  it("全テンプレ技を選定前に検証し、重複と不正adoptionRateを拒否する", () => {
    const duplicate = archetypePokemon({
      moves: [
        { moveId: 21, adoptionRate: new Prisma.Decimal("1"), move: move() },
        { moveId: 21, adoptionRate: new Prisma.Decimal("0.5"), move: move() },
      ],
    });
    expect(() => toArchetypeCounterplanSnapshots([duplicate], [], 50, null)).toThrow(RangeError);

    const invalidRate = archetypePokemon({
      moves: [{ moveId: 21, adoptionRate: new Prisma.Decimal("1.1"), move: move() }],
    });
    expect(() => toArchetypeCounterplanSnapshots([invalidRate], [], 50, null)).toThrow(RangeError);
  });

  it("未取消観測技をseq順で優先し、重複排除後にテンプレで4枠を補完する", () => {
    const pokemon = archetypePokemon({
      moves: [
        { moveId: 21, adoptionRate: new Prisma.Decimal("1"), move: move() },
        { moveId: 22, adoptionRate: new Prisma.Decimal("0.9"), move: move() },
        { moveId: 23, adoptionRate: new Prisma.Decimal("0.8"), move: move() },
        { moveId: 24, adoptionRate: new Prisma.Decimal("0.7"), move: move() },
      ],
    });
    const result = toArchetypeCounterplanSnapshots(
      [pokemon],
      [observedMove(2, 99), observedMove(1, 98), observedMove(3, 98)],
      50,
      null,
    );

    expect(result.combatants[0]?.combatant.moves.map(({ moveId }) => moveId)).toEqual([
      98, 99, 21, 22,
    ]);
    expect(
      result.combatants[0]?.combatant.moves.slice(0, 2).map(({ adoptionRate }) => adoptionRate),
    ).toEqual([1, 1]);
    expect(result.combatants[0]?.combatant.isObserved).toBe(true);
  });

  it("1体へ5種類の観測技と構築外Pokemonへの観測をSession不整合として拒否する", () => {
    expect(() =>
      toArchetypeCounterplanSnapshots(
        [archetypePokemon()],
        [1, 2, 3, 4, 5].map((moveId) => observedMove(moveId, moveId + 90)),
        50,
        null,
      ),
    ).toThrow(InvalidObservedMoveStateError);

    expect(() =>
      toArchetypeCounterplanSnapshots(
        [archetypePokemon()],
        [observedMove(1, 99, { pokemonId: 999 })],
        50,
        null,
      ),
    ).toThrow(InvalidObservedMoveStateError);
  });
});

describe("defaultLeads変換", () => {
  const pokemons = [
    { slot: 3, pokemonId: 103 },
    { slot: 1, pokemonId: 101 },
    { slot: 2, pokemonId: 102 },
  ];

  it("仕様上のslot順を保ってpriority Pokemon IDへ変換する", () => {
    expect(resolvePriorityOpponentPokemonIds([2, 1], pokemons)).toEqual([102, 101]);
    expect(resolvePriorityOpponentPokemonIds([], pokemons)).toEqual([]);
    expect(resolvePriorityOpponentPokemonIds(null, pokemons)).toEqual([]);
  });

  it("存在しないslot・重複slot・重複Pokemon IDを拒否する", () => {
    expect(() => resolvePriorityOpponentPokemonIds([4], pokemons)).toThrow(RangeError);
    expect(() => resolvePriorityOpponentPokemonIds([1, 1], pokemons)).toThrow(RangeError);
    expect(() =>
      resolvePriorityOpponentPokemonIds(
        [1, 2],
        [
          { slot: 1, pokemonId: 101 },
          { slot: 2, pokemonId: 101 },
        ],
      ),
    ).toThrow(RangeError);
  });
});
