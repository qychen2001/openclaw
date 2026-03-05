import type { ModelDefinitionConfig } from "../config/types.models.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("siliconflow-models");

export const SILICONFLOW_BASE_URL = "https://api.siliconflow.com/v1";
export const SILICONFLOW_CN_BASE_URL = "https://api.siliconflow.cn/v1";

const SILICONFLOW_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const SILICONFLOW_DEFAULT_CONTEXT_WINDOW = 131_072;
const SILICONFLOW_DEFAULT_MAX_TOKENS = 8192;

function inferReasoningFromModelId(id: string): boolean {
  const normalized = id.toLowerCase();
  return /(?:^|[/-])r1(?:$|[^\w])/.test(normalized) || /reasoning|thinking|think/.test(normalized);
}

function inferredNameFromModelId(id: string): string {
  const base = id.split("/").pop() ?? id;
  if (!base.trim()) {
    return id;
  }
  return base.replace(/[_-]+/g, " ").trim() || id;
}

/**
 * Minimal fallback catalog used in tests and when /v1/models cannot be reached.
 * Model ids are passed through verbatim to SiliconFlow's OpenAI-compatible API.
 */
export const SILICONFLOW_MODEL_CATALOG: ModelDefinitionConfig[] = [
  {
    id: "deepseek-ai/DeepSeek-R1",
    name: "DeepSeek R1",
    reasoning: true,
    input: ["text"],
    cost: SILICONFLOW_DEFAULT_COST,
    contextWindow: SILICONFLOW_DEFAULT_CONTEXT_WINDOW,
    maxTokens: SILICONFLOW_DEFAULT_MAX_TOKENS,
  },
  {
    id: "deepseek-ai/DeepSeek-V3.1",
    name: "DeepSeek V3.1",
    reasoning: false,
    input: ["text"],
    cost: SILICONFLOW_DEFAULT_COST,
    contextWindow: SILICONFLOW_DEFAULT_CONTEXT_WINDOW,
    maxTokens: SILICONFLOW_DEFAULT_MAX_TOKENS,
  },
  {
    id: "Qwen/Qwen2.5-72B-Instruct",
    name: "Qwen2.5 72B Instruct",
    reasoning: false,
    input: ["text"],
    cost: SILICONFLOW_DEFAULT_COST,
    contextWindow: SILICONFLOW_DEFAULT_CONTEXT_WINDOW,
    maxTokens: SILICONFLOW_DEFAULT_MAX_TOKENS,
  },
];

type OpenAIListModelsResponse = {
  object?: string;
  data?: Array<{ id?: unknown; name?: unknown }>;
};

export async function discoverSiliconflowModels(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<ModelDefinitionConfig[]> {
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return SILICONFLOW_MODEL_CATALOG;
  }

  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    return SILICONFLOW_MODEL_CATALOG;
  }

  const baseUrl = params.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return SILICONFLOW_MODEL_CATALOG;
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      log.warn(`GET /models failed: HTTP ${response.status}, using static catalog`);
      return SILICONFLOW_MODEL_CATALOG;
    }

    const body = (await response.json()) as OpenAIListModelsResponse;
    const data = Array.isArray(body?.data) ? body.data : [];
    if (data.length === 0) {
      log.warn("No models in response, using static catalog");
      return SILICONFLOW_MODEL_CATALOG;
    }

    const seen = new Set<string>();
    const models: ModelDefinitionConfig[] = [];
    for (const entry of data) {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const nameFromApi = typeof entry?.name === "string" ? entry.name.trim() : "";
      const name = nameFromApi || inferredNameFromModelId(id);
      models.push({
        id,
        name,
        reasoning: inferReasoningFromModelId(id),
        input: ["text"],
        cost: SILICONFLOW_DEFAULT_COST,
        contextWindow: SILICONFLOW_DEFAULT_CONTEXT_WINDOW,
        maxTokens: SILICONFLOW_DEFAULT_MAX_TOKENS,
      });
    }

    return models.length > 0 ? models : SILICONFLOW_MODEL_CATALOG;
  } catch (error) {
    log.warn(`Discovery failed: ${String(error)}, using static catalog`);
    return SILICONFLOW_MODEL_CATALOG;
  }
}
