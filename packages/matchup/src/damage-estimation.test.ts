import { describe, expect, it, vi } from "vitest";
import { calculateDamageRange, calculateKnockoutCount } from "./damage-estimation";
import type {
  DamageAttackerSnapshot,
  DamageCalculationInput,
  DamageDefenderSnapshot,
  DamageMoveSnapshot,
} from "./types";

const defaultAttacker: DamageAttackerSnapshot = {
  pokemonId: 1,
  level: 50,
  attack: 120,
  specialAttack: 150,
  type1: "fire",
  type2: null,
};

const defaultDefender: DamageDefenderSnapshot = {
  pokemonId: 2,
  hp: 200,
  defense: 100,
  specialDefense: 120,
  type1: "normal",
  type2: null,
};

const defaultMove: DamageMoveSnapshot = {
  moveId: 10,
  type: "fire",
  category: "physical",
  power: 100,
};

function createInput(overrides?: {
  attacker?: Partial<DamageAttackerSnapshot>;
  defender?: Partial<DamageDefenderSnapshot>;
  move?: Partial<DamageMoveSnapshot>;
}): DamageCalculationInput {
  return {
    attacker: { ...defaultAttacker, ...overrides?.attacker },
    defender: { ...defaultDefender, ...overrides?.defender },
    move: { ...defaultMove, ...overrides?.move },
  };
}

describe("calculateDamageRange", () => {
  it("物理技では攻撃と防御を使い、タイプ一致を適用する", () => {
    const result = calculateDamageRange(createInput());

    expect(result).toMatchObject({
      moveId: 10,
      category: "physical",
      minDamage: 81,
      maxDamage: 81,
      minDamagePercent: 40.5,
      maxDamagePercent: 40.5,
      typeMultiplier: 1,
      stabMultiplier: 1.5,
      attackerStat: 120,
      defenderStat: 100,
      canDamage: true,
      isImmune: false,
      knockoutCount: 3,
      possibleKnockoutCount: 3,
      knockoutClassification: "guaranteed_three_plus_hits",
    });
  });

  it("特殊技では特攻と特防を使う", () => {
    const result = calculateDamageRange(
      createInput({
        defender: { type1: "water", type2: "flying" },
        move: { type: "electric", category: "special", power: 80 },
      }),
    );

    expect(result).toMatchObject({
      minDamage: 184,
      maxDamage: 184,
      typeMultiplier: 4,
      stabMultiplier: 1,
      attackerStat: 150,
      defenderStat: 120,
    });
  });

  it.each([
    [{ type1: "grass", type2: null }, 2, 162],
    [{ type1: "grass", type2: "steel" }, 4, 324],
    [{ type1: "water", type2: null }, 0.5, 40],
    [{ type1: "water", type2: "dragon" }, 0.25, 20],
    [{ type1: "normal", type2: null }, 1, 81],
  ] as const)(
    "単一・複合タイプへの倍率を再利用する: defense=%o",
    (defenderTyping, expectedMultiplier, expectedDamage) => {
      const result = calculateDamageRange(
        createInput({
          defender: defenderTyping,
        }),
      );

      expect(result.typeMultiplier).toBe(expectedMultiplier);
      expect(result.minDamage).toBe(expectedDamage);
      expect(result.maxDamage).toBe(expectedDamage);
    },
  );

  it("0倍ではダメージ0・無効・倒せないを返す", () => {
    const result = calculateDamageRange(
      createInput({
        defender: { type1: "ghost" },
        move: { type: "normal" },
      }),
    );

    expect(result).toMatchObject({
      minDamage: 0,
      maxDamage: 0,
      minDamagePercent: 0,
      maxDamagePercent: 0,
      typeMultiplier: 0,
      canDamage: false,
      isImmune: true,
      knockoutCount: null,
      possibleKnockoutCount: null,
      knockoutClassification: "cannot_ko",
    });
  });

  it("タイプ不一致ではSTABを適用しない", () => {
    const result = calculateDamageRange(createInput({ move: { type: "normal" } }));

    expect(result.stabMultiplier).toBe(1);
    expect(result.minDamage).toBe(54);
  });

  it("簡易式の各整数除算と最終補正でfloor境界を維持する", () => {
    const minimumBaseDamage = calculateDamageRange(
      createInput({
        attacker: { level: 1, attack: 1 },
        defender: { defense: 3 },
        move: { type: "normal", power: 1 },
      }),
    );
    const fractionalStab = calculateDamageRange(
      createInput({
        attacker: { attack: 100 },
        defender: { defense: 100 },
        move: { power: 8 },
      }),
    );

    expect(minimumBaseDamage.minDamage).toBe(2);
    expect(fractionalStab.minDamage).toBe(7);
  });

  it("PRODUCT_SPECどおり乱数を使わず下限と上限を同値にする", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be called");
    });

    const first = calculateDamageRange(createInput());
    const second = calculateDamageRange(createInput());

    expect(first).toEqual(second);
    expect(first.minDamage).toBe(first.maxDamage);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("status技はpower=nullだけを受け付け、能力値を使わずダメージ0にする", () => {
    const result = calculateDamageRange(
      createInput({
        move: { category: "status", power: null },
      }),
    );

    expect(result).toMatchObject({
      category: "status",
      minDamage: 0,
      maxDamage: 0,
      stabMultiplier: 1,
      attackerStat: null,
      defenderStat: null,
      canDamage: false,
      isImmune: false,
      knockoutClassification: "cannot_ko",
    });
  });

  it("入力を変更せず、返却値の変更も次の計算へ影響させない", () => {
    const input = Object.freeze({
      attacker: Object.freeze({ ...defaultAttacker }),
      defender: Object.freeze({ ...defaultDefender }),
      move: Object.freeze({ ...defaultMove }),
    });

    const first = calculateDamageRange(input);
    Reflect.set(first, "minDamage", 999);
    const second = calculateDamageRange(input);

    expect(input).toEqual({
      attacker: defaultAttacker,
      defender: defaultDefender,
      move: defaultMove,
    });
    expect(second.minDamage).toBe(81);
  });
});

describe("calculateKnockoutCount", () => {
  it.each([
    [100, 100, 100, 1, 1, "guaranteed_one_hit"],
    [100, 99, 100, 2, 1, "possible_one_hit"],
    [100, 50, 50, 2, 2, "guaranteed_two_hit"],
    [100, 49, 50, 3, 2, "possible_two_hit"],
    [100, 34, 34, 3, 3, "guaranteed_three_plus_hits"],
    [100, 20, 34, 5, 3, "possible_three_plus_hits"],
    [100, 0, 50, null, 2, "possible_two_hit"],
  ] as const)(
    "HP%s・damage %s〜%sの確定数境界を分類する",
    (
      defenderHp,
      minDamage,
      maxDamage,
      knockoutCount,
      possibleKnockoutCount,
      knockoutClassification,
    ) => {
      expect(calculateKnockoutCount({ defenderHp, minDamage, maxDamage })).toEqual({
        knockoutCount,
        possibleKnockoutCount,
        knockoutClassification,
      });
    },
  );

  it("最大ダメージも0なら無限ループせず倒せないと返す", () => {
    expect(calculateKnockoutCount({ defenderHp: 100, minDamage: 0, maxDamage: 0 })).toEqual({
      knockoutCount: null,
      possibleKnockoutCount: null,
      knockoutClassification: "cannot_ko",
    });
  });

  it("HPとダメージが一致する境界と、2回で1ポイント届かない境界を区別する", () => {
    expect(
      calculateKnockoutCount({ defenderHp: 100, minDamage: 100, maxDamage: 100 }),
    ).toMatchObject({
      knockoutCount: 1,
    });
    expect(calculateKnockoutCount({ defenderHp: 99, minDamage: 49, maxDamage: 49 })).toMatchObject({
      knockoutCount: 3,
    });
  });
});

describe("damage input validation", () => {
  it.each([0, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正なlevel %sを拒否する",
    (level) => {
      expect(() => calculateDamageRange(createInput({ attacker: { level } }))).toThrow(RangeError);
    },
  );

  it.each([
    ["attacker.attack", { attacker: { attack: 0 } }],
    ["attacker.specialAttack", { attacker: { specialAttack: 0 } }],
    ["defender.hp", { defender: { hp: 0 } }],
    ["defender.defense", { defender: { defense: 0 } }],
    ["defender.specialDefense", { defender: { specialDefense: 0 } }],
  ] as const)("%sが0の入力を拒否する", (_label, overrides) => {
    expect(() => calculateDamageRange(createInput(overrides))).toThrow(RangeError);
  });

  it.each([null, 0, -1, 1.5, 301, Number.NaN, Number.POSITIVE_INFINITY])(
    "ダメージ技の不正power %sを拒否する",
    (power) => {
      expect(() => calculateDamageRange(createInput({ move: { power } }))).toThrow(RangeError);
    },
  );

  it.each([0, 1, -1])("status技のnull以外のpower %sを拒否する", (power) => {
    expect(() =>
      calculateDamageRange(createInput({ move: { category: "status", power } })),
    ).toThrow(RangeError);
  });

  it("不正なcategoryを拒否する", () => {
    const input = createInput();
    Reflect.set(input.move, "category", "damage");
    expect(() => calculateDamageRange(input)).toThrowError(/category/);
  });

  it.each([
    ["attacker.type1", { attacker: { type1: "stellar" } }],
    ["attacker.type2", { attacker: { type2: "stellar" } }],
    ["defender.type1", { defender: { type1: "stellar" } }],
    ["move.type", { move: { type: "stellar" } }],
  ] as const)("不正なタイプ%sを拒否する", (_label, overrides) => {
    const input = createInput();
    const target =
      "attacker" in overrides
        ? input.attacker
        : "defender" in overrides
          ? input.defender
          : input.move;
    const override =
      "attacker" in overrides
        ? overrides.attacker
        : "defender" in overrides
          ? overrides.defender
          : overrides.move;
    Object.assign(target, override);
    expect(() => calculateDamageRange(input)).toThrowError(/supported Pokemon type/);
  });

  it.each([
    ["attacker", { attacker: { type1: "fire", type2: "fire" } }],
    ["defender", { defender: { type1: "water", type2: "water" } }],
  ] as const)("重複した%sのtype1/type2を拒否する", (_label, overrides) => {
    expect(() => calculateDamageRange(createInput(overrides))).toThrowError(/must differ/);
  });

  it("安全整数外のID・能力値・威力を拒否する", () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    expect(() => calculateDamageRange(createInput({ attacker: { pokemonId: unsafe } }))).toThrow(
      RangeError,
    );
    expect(() => calculateDamageRange(createInput({ attacker: { attack: unsafe } }))).toThrow(
      RangeError,
    );
    expect(() => calculateDamageRange(createInput({ move: { power: unsafe } }))).toThrow(
      RangeError,
    );
  });

  it.each([
    { defenderHp: 0, minDamage: 1, maxDamage: 1 },
    { defenderHp: 100, minDamage: -1, maxDamage: 1 },
    { defenderHp: 100, minDamage: 1.5, maxDamage: 2 },
    { defenderHp: 100, minDamage: 2, maxDamage: 1 },
    { defenderHp: 100, minDamage: Number.NaN, maxDamage: 1 },
    { defenderHp: 100, minDamage: 1, maxDamage: Number.POSITIVE_INFINITY },
  ])("不正な確定数入力を拒否する: %o", (input) => {
    expect(() => calculateKnockoutCount(input)).toThrow(RangeError);
  });
});
