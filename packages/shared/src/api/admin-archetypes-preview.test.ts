import { describe, expect, it } from "vitest";
import {
  adminArchetypePreviewCandidateSchema,
  adminArchetypePreviewRequestSchema,
  adminArchetypePreviewResponseSchema,
  adminArchetypeWriteSchema,
} from "./admin-archetypes";

const validRequest = {
  name: "メガギャラドス展開",
  description: "起点を作って展開する構築",
  seasonId: 1,
  ruleId: 1,
  defaultLeads: [1],
  playstyleNotes: "カバルドンから展開する",
  pokemons: [
    {
      slot: 1,
      pokemonId: 1,
      itemId: 1,
      itemAlternatives: [2],
      abilityId: 1,
      role: "lead",
      moves: [{ moveId: 1, adoptionRate: 1 }],
    },
  ],
  sources: [
    {
      title: "構築記事",
      url: "https://example.com/archetype",
      siteName: "Example",
    },
  ],
} as const;

const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const validCandidate = {
  archetypeId,
  name: "メガギャラドス展開",
  matchRate: 87.5,
  rank: 1,
  popularityTier: "high",
  matched: [
    {
      observationSeq: 1,
      kind: "pokemon",
      matched: true,
      points: 10,
      pokemonId: 1,
    },
  ],
  contradictions: [
    {
      observationSeq: 2,
      kind: "move",
      penaltyPoints: -12,
      contradictionCode: "move_not_in_archetype",
      pokemonId: 1,
      moveId: 9,
    },
  ],
  exclusionCodes: [],
  likelyUnseen: [{ pokemonId: 5, usageRate: 0.8 }],
  threatMoveIds: [3, 4],
} as const;

describe("ARCHETYPE-005 shared preview schemas", () => {
  it("プレビュー入力は作成入力スキーマを再利用する", () => {
    const viaPreview = adminArchetypePreviewRequestSchema.parse(validRequest);
    const viaWrite = adminArchetypeWriteSchema.parse(validRequest);

    expect(viaPreview).toEqual(viaWrite);
  });

  it("不正なプレビュー入力(未知キー・不正マスタID型)を拒否する", () => {
    expect(
      adminArchetypePreviewRequestSchema.safeParse({ ...validRequest, unexpected: true }).success,
    ).toBe(false);
    expect(
      adminArchetypePreviewRequestSchema.safeParse({ ...validRequest, seasonId: 0 }).success,
    ).toBe(false);
  });

  it("正常なプレビューレスポンスを検証する", () => {
    const response = {
      exactDuplicate: true,
      exactDuplicateArchetypeId: archetypeId,
      candidates: [validCandidate],
    };

    expect(adminArchetypePreviewResponseSchema.parse(response)).toEqual(response);
  });

  it("完全重複が無い場合は exactDuplicateArchetypeId を null にできる", () => {
    const response = {
      exactDuplicate: false,
      exactDuplicateArchetypeId: null,
      candidates: [],
    };

    expect(adminArchetypePreviewResponseSchema.parse(response)).toEqual(response);
  });

  it("候補に余分な内部情報(rawScore / maxScore / excluded)を含められない", () => {
    expect(
      adminArchetypePreviewCandidateSchema.safeParse({ ...validCandidate, rawScore: 56 }).success,
    ).toBe(false);
    expect(
      adminArchetypePreviewCandidateSchema.safeParse({ ...validCandidate, maxScore: 56 }).success,
    ).toBe(false);
    expect(
      adminArchetypePreviewCandidateSchema.safeParse({ ...validCandidate, excluded: false })
        .success,
    ).toBe(false);
  });

  it("レスポンスは strict で未知トップレベルキーを拒否する", () => {
    expect(
      adminArchetypePreviewResponseSchema.safeParse({
        exactDuplicate: false,
        exactDuplicateArchetypeId: null,
        candidates: [],
        warning: "extra",
      }).success,
    ).toBe(false);
  });

  it("matchRate は 0〜100、rank は正の整数に制限する", () => {
    expect(
      adminArchetypePreviewCandidateSchema.safeParse({ ...validCandidate, matchRate: 100.1 })
        .success,
    ).toBe(false);
    expect(
      adminArchetypePreviewCandidateSchema.safeParse({ ...validCandidate, rank: 0 }).success,
    ).toBe(false);
  });
});
