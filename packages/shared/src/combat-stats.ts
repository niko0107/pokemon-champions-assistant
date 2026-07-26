import { z } from "zod";

const combatActualStatSchema = z.number().int().safe().positive();

/**
 * ダメージ計算に使用する確定済みの戦闘能力値。
 * 種族値・EV・IVとは異なり、性格補正などを反映した実数値を表す。
 */
export const combatActualStatsSchema = z
  .object({
    hp: combatActualStatSchema,
    attack: combatActualStatSchema,
    defense: combatActualStatSchema,
    specialAttack: combatActualStatSchema,
    specialDefense: combatActualStatSchema,
    speed: combatActualStatSchema,
  })
  .strict();

export type CombatActualStats = z.infer<typeof combatActualStatsSchema>;
