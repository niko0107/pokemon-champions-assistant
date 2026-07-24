import { describe, expect, it } from "vitest";
import { pokemonMoveSchema } from "./pokemon-move";

describe("pokemonMoveSchema", () => {
  it("正の整数IDの組み合わせを受理する", () => {
    expect(pokemonMoveSchema.parse({ pokemonId: 25, moveId: 98 })).toEqual({
      pokemonId: 25,
      moveId: 98,
    });
  });

  it.each([
    { label: "pokemonIdが0", value: { pokemonId: 0, moveId: 1 } },
    { label: "moveIdが負数", value: { pokemonId: 1, moveId: -1 } },
    { label: "pokemonIdが小数", value: { pokemonId: 1.5, moveId: 1 } },
  ])("$labelを拒否する", ({ value }) => {
    expect(pokemonMoveSchema.safeParse(value).success).toBe(false);
  });
});
