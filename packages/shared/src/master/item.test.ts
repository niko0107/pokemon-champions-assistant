import { describe, expect, it } from "vitest";
import { itemEffectTagsSchema, itemMasterSchema } from "./item";

describe("itemEffectTagsSchema", () => {
  it("許可されたタグと空配列を受理する", () => {
    expect(itemEffectTagsSchema.parse(["choice", "mega_stone"])).toEqual(["choice", "mega_stone"]);
    expect(itemEffectTagsSchema.parse([])).toEqual([]);
  });

  it.each([
    { label: "空文字", value: [""] },
    { label: "重複", value: ["berry", "berry"] },
    { label: "非文字列", value: ["berry", 1] },
    { label: "許可されていない値", value: ["unknown"] },
  ])("$label を拒否する", ({ value }) => {
    expect(itemEffectTagsSchema.safeParse(value).success).toBe(false);
  });
});

describe("itemMasterSchema", () => {
  it("持ち物マスタを受理する", () => {
    expect(
      itemMasterSchema.parse({
        nameJa: "こだわりスカーフ",
        nameEn: "Choice Scarf",
        effectTags: ["choice", "speed_boost"],
      }),
    ).toEqual({
      nameJa: "こだわりスカーフ",
      nameEn: "Choice Scarf",
      effectTags: ["choice", "speed_boost"],
    });
  });

  it.each([
    { label: "日本語名", override: { nameJa: " " } },
    { label: "英語名", override: { nameEn: "" } },
  ])("空の$labelを拒否する", ({ override }) => {
    expect(
      itemMasterSchema.safeParse({
        nameJa: "テスト持ち物",
        nameEn: "Test Item",
        effectTags: [],
        ...override,
      }).success,
    ).toBe(false);
  });
});
