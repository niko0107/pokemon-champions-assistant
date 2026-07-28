import { Inject, Injectable } from "@nestjs/common";
import type { CounterplanResult } from "@pokemon-champions/matchup";
import type { CounterplanExplanation } from "@pokemon-champions/shared";
import { ANTHROPIC_CONFIG, type AnthropicExplanationConfig } from "./anthropic-explanation.config";
import { AnthropicGenerationError, classifyAnthropicSdkError } from "./anthropic-generation-error";
import { parseAnthropicCounterplanExplanation } from "./anthropic-explanation-output";
import {
  ANTHROPIC_MESSAGES_CLIENT,
  type AnthropicMessagesClient,
} from "./anthropic-messages.client";
import type { ExplanationGenerator } from "./explanation-generator";

export const ANTHROPIC_SYSTEM_PROMPT = [
  "あなたは、計算済みのポケモン対戦counterplanを短い日本語へ文章化する担当です。",
  "入力JSONにある確定済みデータだけを説明してください。",
  "おすすめPokemon、選出、先発、順位、スコア、classification、reasonCodes、strategyCodes、警戒技、coverageを変更しないでください。",
  "スコアや相性を再計算せず、技・特性・持ち物を推測しないでください。",
  "入力にない情報や外部知識を追加しないでください。",
  "threatNotesとplaystyleNotesは登録済み原文として扱い、内容を膨らませないでください。",
  "各説明は簡潔にし、指定されたJSON構造だけを返してください。",
  "Markdownコードフェンス、Markdown装飾、HTMLを生成しないでください。",
].join("\n");

function projectScore(score: CounterplanResult["perOpponent"][number]["recommendations"][number]) {
  return {
    rank: score.rank,
    selfPokemonId: score.selfPokemonId,
    opponentPokemonId: score.opponentPokemonId,
    totalScore: score.totalScore,
    classification: score.classification,
    offensiveScore: score.matchupResult.offensiveScore,
    defensiveScore: score.matchupResult.defensiveScore,
    damageRaceScore: score.matchupResult.damageRaceScore,
    reasonCodes: [...score.reasonCodes],
  };
}

export function projectCounterplanForAnthropic(input: CounterplanResult) {
  return {
    perOpponent: input.perOpponent.map((opponent) => ({
      opponentPokemonId: opponent.opponentPokemonId,
      recommendations: opponent.recommendations.map(projectScore),
      avoidSelfPokemonIds: [...opponent.avoidSelfPokemonIds],
      cautionMoves: opponent.cautionMoves.map((move) => ({
        moveId: move.moveId,
        opponentPokemonId: move.opponentPokemonId,
        tags: [...move.tags],
        primaryTag: move.primaryTag,
        adoptionRate: move.adoptionRate,
        opponentUsageRate: move.opponentUsageRate,
      })),
      threatNotes: opponent.threatNotes.map((note) => ({
        opponentPokemonId: note.opponentPokemonId,
        note: note.note,
      })),
    })),
    selection: {
      selectedPokemonIds: [...input.selection.selectedPokemonIds],
      leadPokemonId: input.selection.leadPokemonId,
      assignmentsByOpponent: input.selection.assignmentsByOpponent.map((assignment) => ({
        opponentPokemonId: assignment.opponentPokemonId,
        assignedSelfPokemonId: assignment.assignedSelfPokemonId,
      })),
      coveredOpponentPokemonIds: [...input.selection.coveredOpponentPokemonIds],
      uncoveredOpponentPokemonIds: [...input.selection.uncoveredOpponentPokemonIds],
    },
    strategyCodes: [...input.strategyCodes],
    cautionMoves: input.cautionMoves.map((move) => ({
      moveId: move.moveId,
      opponentPokemonId: move.opponentPokemonId,
      tags: [...move.tags],
      primaryTag: move.primaryTag,
      adoptionRate: move.adoptionRate,
      opponentUsageRate: move.opponentUsageRate,
    })),
    threatNotes: input.threatNotes.map((note) => ({
      opponentPokemonId: note.opponentPokemonId,
      note: note.note,
    })),
    playstyleNotes: input.playstyleNotes,
  };
}

function buildUserPrompt(input: CounterplanResult): string {
  return [
    "次の計算済みcounterplanを説明してください。",
    "perOpponentは入力と同じ件数・同じ順序・同じopponentPokemonIdで返してください。",
    "summary、selectionExplanation、各相手のexplanation、strategyExplanationだけを生成してください。",
    JSON.stringify(projectCounterplanForAnthropic(input)),
  ].join("\n");
}

function extractText(
  content: readonly { readonly type: string; readonly text?: string }[],
): string {
  if (content.length === 0 || content.some((block) => block.type !== "text")) {
    throw new AnthropicGenerationError("invalid_output");
  }

  const text = content.map((block) => block.text ?? "").join("");
  if (text.trim().length === 0) {
    throw new AnthropicGenerationError("invalid_output");
  }
  return text;
}

@Injectable()
export class AnthropicExplanationGenerator implements ExplanationGenerator {
  constructor(
    @Inject(ANTHROPIC_CONFIG)
    private readonly config: AnthropicExplanationConfig,
    @Inject(ANTHROPIC_MESSAGES_CLIENT)
    private readonly client: AnthropicMessagesClient | null,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }

  async generateCounterplanExplanation(input: CounterplanResult): Promise<CounterplanExplanation> {
    if (!this.config.enabled || this.client === null) {
      throw new AnthropicGenerationError("configuration");
    }

    let response;
    try {
      response = await this.client.createExplanationMessage({
        model: this.config.model,
        timeoutMs: this.config.timeoutMs,
        system: ANTHROPIC_SYSTEM_PROMPT,
        user: buildUserPrompt(input),
      });
    } catch (error: unknown) {
      throw new AnthropicGenerationError(classifyAnthropicSdkError(error));
    }

    try {
      if (response.stopReason !== "end_turn") {
        throw new AnthropicGenerationError("invalid_output");
      }
      const text = extractText(response.content);
      const parsed: unknown = JSON.parse(text);
      return parseAnthropicCounterplanExplanation(
        parsed,
        input.perOpponent.map(({ opponentPokemonId }) => opponentPokemonId),
      );
    } catch (error: unknown) {
      if (error instanceof AnthropicGenerationError) {
        throw error;
      }
      throw new AnthropicGenerationError("invalid_output");
    }
  }
}
