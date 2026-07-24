import { describe, expect, it } from "vitest";
import { pokemonAbilitiesSchema } from "./pokemon";

describe("pokemonAbilitiesSchema", () => {
  it("1件以上の重複しない特性名を受理する", () => {
    expect(pokemonAbilitiesSchema.parse(["せいでんき", "ひらいしん"])).toEqual([
      "せいでんき",
      "ひらいしん",
    ]);
  });

  it.each([
    { label: "空配列", value: [] },
    { label: "空文字の特性名", value: ["  "] },
    { label: "重複した特性名", value: ["せいでんき", " せいでんき "] },
    { label: "文字列以外の要素", value: ["せいでんき", 1] },
  ])("$label を拒否する", ({ value }) => {
    expect(pokemonAbilitiesSchema.safeParse(value).success).toBe(false);
  });
});
