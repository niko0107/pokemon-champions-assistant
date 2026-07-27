import { describe, expect, it } from "vitest";
import {
  archetypeDetailParamsSchema,
  publicArchetypeDetailSchema,
  type PublicArchetypeDetail,
} from "./archetype-detail";

const archetypeId = "30000000-0000-4000-8000-000000000001";

function pokemon(slot: number): PublicArchetypeDetail["pokemons"][number] {
  return {
    slot,
    usageRate: slot === 1 ? 0 : 1,
    nature: slot === 1 ? "ようき" : null,
    teraType: slot === 1 ? "fire" : null,
    evs: slot === 1 ? { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } : null,
    actualStats: {
      hp: 150 + slot,
      attack: 120,
      defense: 100,
      specialAttack: 90,
      specialDefense: 100,
      speed: 110,
    },
    role: slot === 1 ? "lead" : "support",
    threatNotes: slot === 1 ? "積み技に注意" : null,
    pokemon: {
      id: slot,
      nameJa: `ポケモン${slot}`,
      nameEn: `Pokemon ${slot}`,
      form: slot === 1 ? "mega" : "normal",
      type1: "fire",
      type2: slot === 1 ? "flying" : null,
      isMega: slot === 1,
    },
    item:
      slot === 1
        ? {
            id: 1,
            nameJa: "きあいのタスキ",
            nameEn: "Focus Sash",
          }
        : null,
    ability:
      slot === 1
        ? {
            id: 1,
            nameJa: "もうか",
            nameEn: "Blaze",
          }
        : null,
    moves: [
      {
        moveId: slot,
        nameJa: `技${slot}`,
        nameEn: `Move ${slot}`,
        type: "fire",
        category: slot === 1 ? "special" : "status",
        power: slot === 1 ? 90 : null,
        accuracy: 100,
        priority: 0,
        tags: slot === 1 ? [] : ["status"],
        adoptionRate: slot === 1 ? 0 : 1,
      },
    ],
  };
}

function validDetail(): PublicArchetypeDetail {
  return {
    id: archetypeId,
    name: "公開構築",
    description: "構築の説明",
    rule: {
      id: 1,
      name: "シングルバトル",
      teamSize: 6,
      pickSize: 3,
      battleLevel: 50,
    },
    season: {
      id: 1,
      name: "シーズン1",
    },
    defaultLeads: [1, 3, 6],
    playstyleNotes: "基本選出から展開する",
    pokemons: Array.from({ length: 6 }, (_, index) => pokemon(index + 1)),
    sources: [
      {
        title: "公式大会結果",
        url: "https://example.com/archetype",
        siteName: "Example",
      },
    ],
  };
}

describe("WEB-008 public archetype detail schema", () => {
  it("strictなUUID paramsを検証する", () => {
    expect(archetypeDetailParamsSchema.parse({ id: archetypeId })).toEqual({ id: archetypeId });
    expect(archetypeDetailParamsSchema.safeParse({ id: "invalid" }).success).toBe(false);
    expect(
      archetypeDetailParamsSchema.safeParse({ id: archetypeId, userId: archetypeId }).success,
    ).toBe(false);
  });

  it("6体・技・nullable持ち物・基本選出・notes・出典・能力値を検証する", () => {
    const parsed = publicArchetypeDetailSchema.parse(validDetail());

    expect(parsed.pokemons).toHaveLength(6);
    expect(parsed.pokemons[0]).toMatchObject({
      usageRate: 0,
      item: { nameJa: "きあいのタスキ" },
      actualStats: { hp: 151, speed: 110 },
      moves: [{ adoptionRate: 0, power: 90 }],
    });
    expect(parsed.pokemons[1]?.item).toBeNull();
    expect(parsed.defaultLeads).toEqual([1, 3, 6]);
    expect(parsed.playstyleNotes).toBe("基本選出から展開する");
    expect(parsed.sources[0]?.url).toBe("https://example.com/archetype");
  });

  it("空の基本選出・notes・出典とnullの登録値を許可する", () => {
    const detail = validDetail();
    detail.defaultLeads = [];
    detail.playstyleNotes = null;
    detail.sources = [];
    detail.pokemons[0] = {
      ...detail.pokemons[0]!,
      evs: null,
      actualStats: null,
      threatNotes: null,
      item: null,
      ability: null,
      moves: [],
    };

    expect(publicArchetypeDetailSchema.safeParse(detail).success).toBe(true);
  });

  it.each([
    ["不正URL", "javascript:alert(1)"],
    ["data URL", "data:text/html,test"],
  ])("%sを拒否する", (_label, url) => {
    const detail = validDetail();
    detail.sources[0] = { ...detail.sources[0]!, url };
    expect(publicArchetypeDetailSchema.safeParse(detail).success).toBe(false);
  });

  it.each([
    ["usageRate負数", "usageRate", -0.1],
    ["usageRate上限超過", "usageRate", 1.1],
    ["usageRate NaN", "usageRate", Number.NaN],
    ["usageRate Infinity", "usageRate", Number.POSITIVE_INFINITY],
    ["adoptionRate負数", "adoptionRate", -0.1],
    ["adoptionRate上限超過", "adoptionRate", 1.1],
    ["adoptionRate NaN", "adoptionRate", Number.NaN],
    ["adoptionRate Infinity", "adoptionRate", Number.POSITIVE_INFINITY],
  ])("%sを拒否する", (_label, field, value) => {
    const detail = validDetail();
    if (field === "usageRate") {
      detail.pokemons[0] = { ...detail.pokemons[0]!, usageRate: value };
    } else {
      detail.pokemons[0]!.moves[0] = {
        ...detail.pokemons[0]!.moves[0]!,
        adoptionRate: value,
      };
    }
    expect(publicArchetypeDetailSchema.safeParse(detail).success).toBe(false);
  });

  it("余分な内部キーと不正actualStatsを拒否する", () => {
    expect(
      publicArchetypeDetailSchema.safeParse({
        ...validDetail(),
        status: "published",
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(false);

    const detail = validDetail();
    detail.pokemons[0] = {
      ...detail.pokemons[0]!,
      actualStats: {
        ...detail.pokemons[0]!.actualStats!,
        hp: Number.POSITIVE_INFINITY,
      },
    };
    expect(publicArchetypeDetailSchema.safeParse(detail).success).toBe(false);
  });

  it("Rule人数不一致・重複・存在しない基本選出slotを拒否する", () => {
    const wrongCount = validDetail();
    wrongCount.pokemons.pop();
    expect(publicArchetypeDetailSchema.safeParse(wrongCount).success).toBe(false);

    const duplicate = validDetail();
    duplicate.pokemons[1] = {
      ...duplicate.pokemons[1]!,
      slot: 1,
      pokemon: duplicate.pokemons[0]!.pokemon,
    };
    expect(publicArchetypeDetailSchema.safeParse(duplicate).success).toBe(false);

    const missingLead = validDetail();
    missingLead.defaultLeads = [1, 2, 6, 6];
    expect(publicArchetypeDetailSchema.safeParse(missingLead).success).toBe(false);
  });
});
