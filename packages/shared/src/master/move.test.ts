import { describe, expect, it } from "vitest";
import { moveMasterSchema, moveTagsSchema } from "./move";

describe("moveTagsSchema", () => {
  it("許可されたタグと空配列を受理する", () => {
    expect(moveTagsSchema.parse(["setup", "priority"])).toEqual(["setup", "priority"]);
    expect(moveTagsSchema.parse([])).toEqual([]);
  });

  it.each([
    { label: "空文字", value: [""] },
    { label: "重複", value: ["setup", "setup"] },
    { label: "非文字列", value: ["setup", 1] },
    { label: "許可されていない値", value: ["damage"] },
  ])("$label を拒否する", ({ value }) => {
    expect(moveTagsSchema.safeParse(value).success).toBe(false);
  });
});

describe("moveMasterSchema", () => {
  it("通常の攻撃技を受理する", () => {
    expect(
      moveMasterSchema.parse({
        nameJa: "でんこうせっか",
        nameEn: "Quick Attack",
        type: "normal",
        category: "physical",
        power: 40,
        accuracy: 100,
        priority: 1,
        tags: ["priority"],
      }),
    ).toMatchObject({ power: 40, accuracy: 100, priority: 1 });
  });

  it("変化技のnull威力と必中技のnull命中を受理する", () => {
    expect(
      moveMasterSchema.parse({
        nameJa: "トリックルーム",
        nameEn: "Trick Room",
        type: "psychic",
        category: "status",
        power: null,
        accuracy: null,
        priority: -7,
        tags: ["setup"],
      }),
    ).toMatchObject({ power: null, accuracy: null, priority: -7 });
  });

  it.each([
    { label: "威力0", override: { power: 0 } },
    { label: "威力301", override: { power: 301 } },
    { label: "命中0", override: { accuracy: 0 } },
    { label: "命中101", override: { accuracy: 101 } },
    { label: "優先度-8", override: { priority: -8 } },
    { label: "優先度6", override: { priority: 6 } },
    { label: "不正な分類", override: { category: "damage" } },
  ])("$label を拒否する", ({ override }) => {
    expect(
      moveMasterSchema.safeParse({
        nameJa: "テスト技",
        nameEn: "Test Move",
        type: "normal",
        category: "physical",
        power: 40,
        accuracy: 100,
        priority: 0,
        tags: [],
        ...override,
      }).success,
    ).toBe(false);
  });
});
