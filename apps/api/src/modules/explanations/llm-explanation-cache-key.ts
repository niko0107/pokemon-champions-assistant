import { createHash } from "node:crypto";
import type { CounterplanResult } from "@pokemon-champions/matchup";
import { projectCounterplanForAnthropic } from "./anthropic-explanation-generator";
import {
  CACHE_NAMESPACE_VERSION,
  GENERATOR_VERSION,
  LLM_EXPLANATION_CACHE_PREFIX,
  LLM_EXPLANATION_FAILURE_PREFIX,
  OUTPUT_SCHEMA_VERSION,
  PROMPT_VERSION,
} from "./llm-explanation.constants";
import { counterplanResultSchema } from "./llm-explanation-input";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new TypeError("LLM explanation cache key input is not JSON-compatible");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export interface LlmExplanationCacheKey {
  readonly hash: string;
  readonly cacheKey: string;
  readonly failureKey: string;
  readonly jobId: string;
}

export function buildLlmExplanationCacheKey(
  input: CounterplanResult,
  model: string,
  versions: {
    readonly cacheNamespaceVersion?: number;
    readonly promptVersion?: number;
    readonly outputSchemaVersion?: number;
    readonly generatorVersion?: number;
  } = {},
): LlmExplanationCacheKey {
  const parsed = counterplanResultSchema.parse(input) as CounterplanResult;
  const normalizedModel = model.trim();
  if (normalizedModel.length === 0) {
    throw new RangeError("Anthropic model must not be blank");
  }

  const hashInput = {
    cacheNamespaceVersion: versions.cacheNamespaceVersion ?? CACHE_NAMESPACE_VERSION,
    promptVersion: versions.promptVersion ?? PROMPT_VERSION,
    outputSchemaVersion: versions.outputSchemaVersion ?? OUTPUT_SCHEMA_VERSION,
    generatorVersion: versions.generatorVersion ?? GENERATOR_VERSION,
    model: normalizedModel,
    counterplan: projectCounterplanForAnthropic(parsed),
  };
  const hash = createHash("sha256").update(canonicalJson(hashInput)).digest("hex");
  return {
    hash,
    cacheKey: `${LLM_EXPLANATION_CACHE_PREFIX}:${hash}`,
    failureKey: `${LLM_EXPLANATION_FAILURE_PREFIX}:${hash}`,
    jobId: `llm-explanation-${hash}`,
  };
}
