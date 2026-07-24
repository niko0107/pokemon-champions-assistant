import { describe, expect, it } from "vitest";
import { abilityEffectTagsSchema, abilityMasterSchema } from "./ability";

describe("abilityEffectTagsSchema", () => {
  it("許可されたタグと空配列を受理する", () => {
    expect(abilityEffectTagsSchema.parse(["type_immunity", "damage_boost"])).toEqual([
      "type_immunity",
      "damage_boost",
    ]);
    expect(abilityEffectTagsSchema.parse([])).toEqual([]);
  });

  it.each([
    { label: "空文字", value: [""] },
    { label: "重複", value: ["weather", "weather"] },
    { label: "非文字列", value: ["weather", 1] },
    { label: "許可されていない値", value: ["unknown"] },
  ])("$label を拒否する", ({ value }) => {
    expect(abilityEffectTagsSchema.safeParse(value).success).toBe(false);
  });
});

describe("abilityMasterSchema", () => {
  it("特性マスタを受理する", () => {
    expect(
      abilityMasterSchema.parse({
        nameJa: "もらいび",
        nameEn: "Flash Fire",
        effectTags: ["type_immunity", "damage_boost"],
      }),
    ).toEqual({
      nameJa: "もらいび",
      nameEn: "Flash Fire",
      effectTags: ["type_immunity", "damage_boost"],
    });
  });

  it.each([
    { label: "日本語名", override: { nameJa: " " } },
    { label: "英語名", override: { nameEn: "" } },
  ])("空の$labelを拒否する", ({ override }) => {
    expect(
      abilityMasterSchema.safeParse({
        nameJa: "テスト特性",
        nameEn: "Test Ability",
        effectTags: [],
        ...override,
      }).success,
    ).toBe(false);
  });
});
