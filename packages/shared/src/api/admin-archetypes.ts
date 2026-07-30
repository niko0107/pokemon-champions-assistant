import { z } from "zod";
import {
  ARCHETYPE_TEAM_SIZE_MAX,
  archetypeDefaultLeadsSchema,
  archetypeEvsSchema,
  archetypeIvsSchema,
  archetypeItemAlternativeIdsSchema,
  archetypePokemonRoleSchema,
  archetypePopularityTierSchema,
  archetypeStatPointsSchema,
  archetypeStatDataStatusSchema,
  archetypeStatusSchema,
  completeArchetypeIvsSchema,
} from "../archetype";
import { combatActualStatsSchema } from "../combat-stats";
import {
  CONTRADICTION_CODES,
  EXCLUSION_CODES,
  OBSERVATION_KINDS,
  OBSERVATION_POSITIONS,
} from "../enums";

const positiveMasterIdSchema = z.number().int().positive();
const requiredTextSchema = z.string().trim().min(1);
const nullableTextSchema = requiredTextSchema.nullable();
const rateSchema = z.number().min(0).max(1);

export const adminArchetypeIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type AdminArchetypeIdParams = z.infer<typeof adminArchetypeIdParamsSchema>;

export const adminArchetypeMoveInputSchema = z
  .object({
    moveId: positiveMasterIdSchema,
    adoptionRate: rateSchema.default(1),
  })
  .strict();

const adminArchetypePokemonFields = {
  slot: z.number().int().min(1).max(ARCHETYPE_TEAM_SIZE_MAX),
  pokemonId: positiveMasterIdSchema,
  itemId: positiveMasterIdSchema.nullable().default(null),
  itemAlternatives: archetypeItemAlternativeIdsSchema.default([]),
  abilityId: positiveMasterIdSchema.nullable().default(null),
  nature: nullableTextSchema.default(null),
  teraType: nullableTextSchema.default(null),
  evs: archetypeEvsSchema.nullable().default(null),
  statPoints: archetypeStatPointsSchema.nullable().default(null),
  ivs: archetypeIvsSchema.nullable().default(null),
  actualStats: combatActualStatsSchema.nullable(),
  statDataStatus: archetypeStatDataStatusSchema.default("exact"),
  role: archetypePokemonRoleSchema,
  usageRate: rateSchema.default(1),
  threatNotes: nullableTextSchema.default(null),
  moves: z.array(adminArchetypeMoveInputSchema).min(1, "技を1件以上指定してください"),
} as const;

function validateAdminArchetypePokemon(
  pokemon: {
    itemId: number | null;
    itemAlternatives: number[];
    nature: string | null;
    evs: z.infer<typeof archetypeEvsSchema> | null;
    ivs: z.infer<typeof archetypeIvsSchema> | null;
    actualStats: z.infer<typeof combatActualStatsSchema> | null;
    statDataStatus: z.infer<typeof archetypeStatDataStatusSchema>;
    moves: Array<{ moveId: number }>;
  },
  context: z.RefinementCtx,
): void {
  if (
    pokemon.itemId !== null &&
    pokemon.itemAlternatives.some((itemId) => itemId === pokemon.itemId)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "定番持ち物を代替持ち物へ重複指定できません",
      path: ["itemAlternatives"],
    });
  }

  const moveIds = pokemon.moves.map((move) => move.moveId);
  if (new Set(moveIds).size !== moveIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "同じポケモンへ同じ技を重複指定できません",
      path: ["moves"],
    });
  }

  if (pokemon.statDataStatus === "partial" && pokemon.actualStats !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "partialではactualStatsをnullにしてください",
      path: ["actualStats"],
    });
  }

  if (pokemon.statDataStatus !== "partial" && pokemon.actualStats === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "exactまたはderivedではactualStatsを指定してください",
      path: ["actualStats"],
    });
  }

  if (
    pokemon.statDataStatus === "derived" &&
    (pokemon.nature === null ||
      pokemon.evs === null ||
      pokemon.ivs === null ||
      !completeArchetypeIvsSchema.safeParse(pokemon.ivs).success)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "derivedでは性格・EV・全6能力のIVを指定してください",
      path: ["statDataStatus"],
    });
  }
}

export const adminArchetypePokemonInputSchema = z
  .object(adminArchetypePokemonFields)
  .strict()
  .superRefine(validateAdminArchetypePokemon);

export const adminArchetypeSourceInputSchema = z
  .object({
    title: requiredTextSchema,
    url: z
      .string()
      .trim()
      .url("出典URLは有効なURLで指定してください")
      .max(2048)
      .refine((url) => /^https?:\/\//iu.test(url), "出典URLはhttpまたはhttpsで指定してください"),
    siteName: requiredTextSchema,
    siteRank: z.number().int().positive().nullable().default(null),
  })
  .strict();

export const adminArchetypeWriteSchema = z
  .object({
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    defaultLeads: archetypeDefaultLeadsSchema,
    playstyleNotes: requiredTextSchema,
    status: archetypeStatusSchema.default("published"),
    pokemons: z
      .array(adminArchetypePokemonInputSchema)
      .min(1, "採用ポケモンを1体以上指定してください")
      .max(ARCHETYPE_TEAM_SIZE_MAX),
    sources: z.array(adminArchetypeSourceInputSchema).min(1, "出典URLを1件以上指定してください"),
  })
  .strict()
  .superRefine((archetype, context) => {
    const slots = archetype.pokemons.map((pokemon) => pokemon.slot);
    if (new Set(slots).size !== slots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のslotは重複できません",
        path: ["pokemons"],
      });
    }

    const pokemonIds = archetype.pokemons.map((pokemon) => pokemon.pokemonId);
    if (new Set(pokemonIds).size !== pokemonIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "構築内のポケモンは重複できません",
        path: ["pokemons"],
      });
    }

    const slotSet = new Set(slots);
    for (const [index, leadSlot] of archetype.defaultLeads.entries()) {
      if (!slotSet.has(leadSlot)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "基本選出には構築内に存在するslotを指定してください",
          path: ["defaultLeads", index],
        });
      }
    }

    const sourceUrls = archetype.sources.map((source) => source.url);
    if (new Set(sourceUrls).size !== sourceUrls.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "同じ出典URLは重複できません",
        path: ["sources"],
      });
    }
  });

export type AdminArchetypeWrite = z.infer<typeof adminArchetypeWriteSchema>;
export type AdminArchetypePokemonInput = z.infer<typeof adminArchetypePokemonInputSchema>;

const timestampSchema = z.string().datetime({ offset: true });

export const adminArchetypeMoveSchema = adminArchetypeMoveInputSchema;
export const adminArchetypePokemonSchema = z
  .object(adminArchetypePokemonFields)
  .strict()
  .superRefine(validateAdminArchetypePokemon);
export const adminArchetypeSourceSchema = adminArchetypeSourceInputSchema;

export const adminArchetypeDetailSchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    popularityTier: archetypePopularityTierSchema,
    popularityScore: z.number().min(0).max(100).nullable(),
    encounterCount: z.number().int().nonnegative(),
    pickCount: z.number().int().nonnegative(),
    defaultLeads: archetypeDefaultLeadsSchema,
    playstyleNotes: requiredTextSchema,
    status: archetypeStatusSchema,
    publishedAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    pokemons: z.array(adminArchetypePokemonSchema).max(ARCHETYPE_TEAM_SIZE_MAX),
    sources: z.array(adminArchetypeSourceSchema).min(1),
  })
  .strict();

export type AdminArchetypeDetail = z.infer<typeof adminArchetypeDetailSchema>;

export const adminArchetypeSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: requiredTextSchema.max(100),
    description: requiredTextSchema,
    seasonId: positiveMasterIdSchema,
    ruleId: positiveMasterIdSchema,
    popularityTier: archetypePopularityTierSchema,
    status: archetypeStatusSchema,
    publishedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type AdminArchetypeSummary = z.infer<typeof adminArchetypeSummarySchema>;

export const adminArchetypeListResponseSchema = z
  .object({
    items: z.array(adminArchetypeSummarySchema),
  })
  .strict();

export type AdminArchetypeListResponse = z.infer<typeof adminArchetypeListResponseSchema>;

/**
 * ARCHETYPE-005 プレビュー(重複チェック・一致判定)。
 *
 * 入力は ARCHETYPE-002 の作成入力スキーマをそのまま再利用する(保存前の構築内容を
 * 既存構築と比較するだけで、DB への保存・更新・削除は行わない)。
 */
export const adminArchetypePreviewRequestSchema = adminArchetypeWriteSchema;

export type AdminArchetypePreviewRequest = z.infer<typeof adminArchetypePreviewRequestSchema>;

const scoreValueSchema = z.number().finite();

/**
 * 一致/不一致の内訳1件(packages/scoring の MatchDetail に対応)。
 * 余分な内部項目を返さないよう strict にし、既存スコアリング出力の意味を維持する。
 */
export const adminArchetypeMatchDetailSchema = z
  .object({
    observationSeq: positiveMasterIdSchema,
    kind: z.enum(OBSERVATION_KINDS),
    matched: z.boolean(),
    points: scoreValueSchema,
    pokemonId: positiveMasterIdSchema.optional(),
    moveId: positiveMasterIdSchema.optional(),
    itemId: positiveMasterIdSchema.optional(),
    abilityId: positiveMasterIdSchema.optional(),
    position: z.enum(OBSERVATION_POSITIONS).optional(),
  })
  .strict();

/** 矛盾減点の診断内訳1件(packages/scoring の ContradictionDetail に対応)。 */
export const adminArchetypeContradictionDetailSchema = z
  .object({
    observationSeq: positiveMasterIdSchema,
    kind: z.enum(OBSERVATION_KINDS),
    penaltyPoints: scoreValueSchema,
    contradictionCode: z.enum(CONTRADICTION_CODES),
    pokemonId: positiveMasterIdSchema,
    moveId: positiveMasterIdSchema.optional(),
    itemId: positiveMasterIdSchema.optional(),
    abilityId: positiveMasterIdSchema.optional(),
  })
  .strict();

/** 未観測ポケモンの提示1件(packages/scoring の LikelyUnseenPokemon に対応)。 */
export const adminArchetypeLikelyUnseenSchema = z
  .object({
    pokemonId: positiveMasterIdSchema,
    usageRate: rateSchema,
  })
  .strict();

/**
 * プレビューで返す類似候補1件。RankedCandidate から表示に必要な項目のみを射影し、
 * rawScore / maxScore / excluded などの内部値は返さない(strict で余分な項目を拒否)。
 */
export const adminArchetypePreviewCandidateSchema = z
  .object({
    archetypeId: z.string().uuid(),
    name: requiredTextSchema.max(100),
    matchRate: z.number().min(0).max(100),
    rank: positiveMasterIdSchema,
    popularityTier: archetypePopularityTierSchema,
    matched: z.array(adminArchetypeMatchDetailSchema),
    contradictions: z.array(adminArchetypeContradictionDetailSchema),
    exclusionCodes: z.array(z.enum(EXCLUSION_CODES)),
    likelyUnseen: z.array(adminArchetypeLikelyUnseenSchema),
    threatMoveIds: z.array(positiveMasterIdSchema),
  })
  .strict();

export type AdminArchetypePreviewCandidate = z.infer<typeof adminArchetypePreviewCandidateSchema>;

export const adminArchetypePreviewResponseSchema = z
  .object({
    /** 完全一致する既存構築が存在するか。存在自体は正常な200とし409にしない。 */
    exactDuplicate: z.boolean(),
    /** 完全重複した既存構築のID。無ければ null。複数一致時は最小IDを決定的に返す。 */
    exactDuplicateArchetypeId: z.string().uuid().nullable(),
    /** 一致度→人気度→遭遇数→更新日で決定的に並べた類似候補(除外候補は含めない)。 */
    candidates: z.array(adminArchetypePreviewCandidateSchema),
  })
  .strict();

export type AdminArchetypePreviewResponse = z.infer<typeof adminArchetypePreviewResponseSchema>;

/** popularity_score / encounter_count / pick_count の int4 上限(PostgreSQL int)。 */
const INT4_MAX = 2_147_483_647;

const popularityScoreSchema = z.number().finite().min(0).max(100);
const aggregateCountSchema = z.number().int().min(0).max(INT4_MAX);

/**
 * ARCHETYPE-003 A-02: 人気度の手動調整入力(PRODUCT_SPEC §8.1「管理者が high/mid/low を手動設定」)。
 *
 * MVP では popularityTier の手動設定が主。popularityScore / encounterCount / pickCount は
 * 省略時は変更しない(部分更新)。popularityScore は null を明示すると値をクリアできる。
 * 人気度の数値スコア自動計算(OPS-001)は本タスクの対象外で、ここでは手動値のみ扱う。
 */
export const adminArchetypePopularityUpdateSchema = z
  .object({
    popularityTier: archetypePopularityTierSchema,
    popularityScore: popularityScoreSchema.nullable().optional(),
    encounterCount: aggregateCountSchema.optional(),
    pickCount: aggregateCountSchema.optional(),
  })
  .strict();

export type AdminArchetypePopularityUpdate = z.infer<typeof adminArchetypePopularityUpdateSchema>;

/**
 * 人気度更新のレスポンス。SCORE-005 の並び替えが参照する popularityTier / encounterCount /
 * updatedAt を含む人気度関連項目のみを返し、構築本文などの内部情報は返さない。
 */
export const adminArchetypePopularitySchema = z
  .object({
    id: z.string().uuid(),
    popularityTier: archetypePopularityTierSchema,
    popularityScore: popularityScoreSchema.nullable(),
    encounterCount: z.number().int().nonnegative(),
    pickCount: z.number().int().nonnegative(),
    updatedAt: timestampSchema,
  })
  .strict();

export type AdminArchetypePopularity = z.infer<typeof adminArchetypePopularitySchema>;
