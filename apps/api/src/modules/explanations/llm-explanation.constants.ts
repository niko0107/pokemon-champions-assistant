export const LLM_EXPLANATION_QUEUE_NAME = "llm-explanations";
export const LLM_EXPLANATION_JOB_NAME = "generate-explanation";

export const CACHE_NAMESPACE_VERSION = 1;
export const PROMPT_VERSION = 1;
export const OUTPUT_SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = 1;

export const LLM_EXPLANATION_CACHE_PREFIX = `pca:llm-explanation:v${CACHE_NAMESPACE_VERSION}`;
export const LLM_EXPLANATION_FAILURE_PREFIX = `pca:llm-explanation-failure:v${CACHE_NAMESPACE_VERSION}`;
export const LLM_EXPLANATION_FAILURE_TTL_SECONDS = 300;
