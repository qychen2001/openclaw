import {
  discoverSiliconflowModels,
  SILICONFLOW_BASE_URL,
  SILICONFLOW_CN_BASE_URL,
} from "../agents/siliconflow-models.js";
import { normalizeApiKeyInput, validateApiKeyInput } from "./auth-choice.api-key.js";
import {
  createAuthChoiceAgentModelNoter,
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeSecretInputModeInput,
} from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";
import {
  applyAuthProfileConfig,
  applySiliconflowConfig,
  applySiliconflowConfigCn,
  applySiliconflowProviderConfig,
  applySiliconflowProviderConfigCn,
  setSiliconflowApiKey,
  setSiliconflowCnApiKey,
} from "./onboard-auth.js";

const SILICONFLOW_MAX_SELECT_MODELS = 50;
const SILICONFLOW_MANUAL_MODEL_ID = "__manual_model_id__";

function matchesKeyword(value: string, keyword: string): boolean {
  const haystack = value.toLowerCase();
  const needle = keyword.toLowerCase();
  return haystack.includes(needle);
}

async function promptSiliconflowModelId(params: {
  prompter: ApplyAuthChoiceParams["prompter"];
  providerLabel: string;
  models: Array<{ id: string; name?: string }>;
}): Promise<string> {
  const modelIndex = new Map(params.models.map((m) => [m.id, m] as const));
  const allModels = [...modelIndex.values()];

  const buildSelectOptions = (models: Array<{ id: string; name?: string }>) => {
    const sorted = [...models].toSorted((a, b) =>
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" }),
    );
    const options = sorted.map((m) => ({
      value: m.id,
      label: m.id,
      hint: m.name && m.name !== m.id ? m.name : undefined,
    }));
    options.push({
      value: SILICONFLOW_MANUAL_MODEL_ID,
      label: "Enter model id manually",
      hint: "Must match discovered catalog",
    });
    return options;
  };

  const promptManual = async (): Promise<string> => {
    const entered = await params.prompter.text({
      message: "Model id",
      validate: (value) => {
        const candidate = String(value ?? "").trim();
        if (!candidate) {
          return "Model id is required.";
        }
        if (!modelIndex.has(candidate)) {
          return `Model id "${candidate}" is not in the discovered SiliconFlow catalog.`;
        }
        return undefined;
      },
    });
    return String(entered ?? "").trim();
  };

  if (allModels.length <= SILICONFLOW_MAX_SELECT_MODELS) {
    const selected = await params.prompter.select({
      message: `Default ${params.providerLabel} model`,
      options: buildSelectOptions(allModels),
    });
    return selected === SILICONFLOW_MANUAL_MODEL_ID ? await promptManual() : selected;
  }

  while (true) {
    const keywordRaw = await params.prompter.text({
      message: `Filter ${params.providerLabel} models (keyword required)`,
      validate: (value) => {
        const candidate = String(value ?? "").trim();
        return candidate ? undefined : "Enter a keyword to filter the model list.";
      },
    });
    const keyword = String(keywordRaw ?? "").trim();
    const filtered = allModels.filter((m) =>
      matchesKeyword(`${m.id} ${m.name ?? ""}`.trim(), keyword),
    );
    if (filtered.length === 0) {
      await params.prompter.note(
        `No models matched "${keyword}". Try a different keyword.`,
        params.providerLabel,
      );
      continue;
    }
    if (filtered.length > SILICONFLOW_MAX_SELECT_MODELS) {
      await params.prompter.note(
        `Too many results (${filtered.length}). Please use a more specific keyword.`,
        params.providerLabel,
      );
      continue;
    }

    const selected = await params.prompter.select({
      message: `Default ${params.providerLabel} model`,
      options: buildSelectOptions(filtered),
    });
    return selected === SILICONFLOW_MANUAL_MODEL_ID ? await promptManual() : selected;
  }
}

export async function applyAuthChoiceSiliconflow(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  const isCn = params.authChoice === "siliconflow-api-key-cn";
  if (!isCn && params.authChoice !== "siliconflow-api-key") {
    return null;
  }

  const provider = isCn ? "siliconflow-cn" : "siliconflow";
  const providerLabel = isCn ? "SiliconFlow (.cn)" : "SiliconFlow";
  const envVar = isCn ? "SILICONFLOW_CN_API_KEY" : "SILICONFLOW_API_KEY";
  const baseUrl = isCn ? SILICONFLOW_CN_BASE_URL : SILICONFLOW_BASE_URL;
  const profileId = `${provider}:default`;

  let nextConfig = params.config;
  let agentModelOverride: string | undefined;
  const noteAgentModel = createAuthChoiceAgentModelNoter(params);
  const requestedSecretInputMode = normalizeSecretInputModeInput(params.opts?.secretInputMode);

  const sfKey = await ensureApiKeyFromOptionEnvOrPrompt({
    token: params.opts?.token,
    tokenProvider: params.opts?.tokenProvider,
    secretInputMode: requestedSecretInputMode,
    config: nextConfig,
    expectedProviders: [provider],
    provider,
    envLabel: envVar,
    promptMessage: `Enter ${providerLabel} API key`,
    normalize: normalizeApiKeyInput,
    validate: validateApiKeyInput,
    prompter: params.prompter,
    setCredential: async (apiKey, mode) =>
      isCn
        ? setSiliconflowCnApiKey(apiKey, params.agentDir, { secretInputMode: mode })
        : setSiliconflowApiKey(apiKey, params.agentDir, { secretInputMode: mode }),
  });

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId,
    provider,
    mode: "api_key",
  });

  const models = await discoverSiliconflowModels({ baseUrl, apiKey: sfKey });
  const selectedModelId = await promptSiliconflowModelId({
    prompter: params.prompter,
    providerLabel,
    models,
  });
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? models[0];
  if (!selectedModel) {
    throw new Error("No models available for SiliconFlow onboarding.");
  }

  const modelRef = `${provider}/${selectedModel.id}`;

  const applied = await applyDefaultModelChoice({
    config: nextConfig,
    setDefaultModel: params.setDefaultModel,
    defaultModel: modelRef,
    applyDefaultConfig: (config) =>
      isCn
        ? applySiliconflowConfigCn(config, { model: selectedModel })
        : applySiliconflowConfig(config, { model: selectedModel }),
    applyProviderConfig: (config) =>
      isCn
        ? applySiliconflowProviderConfigCn(config, { model: selectedModel })
        : applySiliconflowProviderConfig(config, { model: selectedModel }),
    noteDefault: modelRef,
    noteAgentModel,
    prompter: params.prompter,
  });

  nextConfig = applied.config;
  agentModelOverride = applied.agentModelOverride ?? agentModelOverride;

  return { config: nextConfig, agentModelOverride };
}
