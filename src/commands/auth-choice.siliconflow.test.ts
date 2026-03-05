import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { applyAuthChoiceSiliconflow } from "./auth-choice.apply.siliconflow.js";
import {
  createAuthTestLifecycle,
  createExitThrowingRuntime,
  createWizardPrompter,
  readAuthProfilesForAgent,
  setupAuthTestEnv,
} from "./test-wizard-helpers.js";

function createSiliconflowPrompter(params: {
  text: WizardPrompter["text"];
  select: WizardPrompter["select"];
}): WizardPrompter {
  return createWizardPrompter(
    {
      text: params.text,
      select: params.select,
    },
    { defaultSelect: "" },
  );
}

type ApplySiliconflowParams = Parameters<typeof applyAuthChoiceSiliconflow>[0];

async function runSiliconflowApply(
  params: Omit<ApplySiliconflowParams, "authChoice" | "setDefaultModel"> &
    Partial<Pick<ApplySiliconflowParams, "setDefaultModel">> & {
      authChoice: "siliconflow-api-key" | "siliconflow-api-key-cn";
    },
) {
  return await applyAuthChoiceSiliconflow({
    setDefaultModel: params.setDefaultModel ?? true,
    ...params,
  });
}

describe("applyAuthChoiceSiliconflow", () => {
  const lifecycle = createAuthTestLifecycle([
    "OPENCLAW_STATE_DIR",
    "OPENCLAW_AGENT_DIR",
    "PI_CODING_AGENT_DIR",
    "SILICONFLOW_API_KEY",
    "SILICONFLOW_CN_API_KEY",
  ]);

  async function setupTempState() {
    const env = await setupAuthTestEnv("openclaw-sf-");
    lifecycle.setStateDir(env.stateDir);
    return env.agentDir;
  }

  async function readAuthProfiles(agentDir: string) {
    return await readAuthProfilesForAgent<{
      profiles?: Record<string, { key?: string }>;
    }>(agentDir);
  }

  afterEach(async () => {
    await lifecycle.cleanup();
  });

  it("returns null when authChoice is not a SiliconFlow option", async () => {
    const result = await applyAuthChoiceSiliconflow({
      authChoice: "openrouter-api-key",
      config: {},
      prompter: {} as WizardPrompter,
      runtime: createExitThrowingRuntime(),
      setDefaultModel: false,
    });
    expect(result).toBeNull();
  });

  it("prompts for key and model, then sets primary and writes auth profile (siliconflow)", async () => {
    const agentDir = await setupTempState();

    const text = vi.fn().mockResolvedValue("sf-test-key");
    const select: WizardPrompter["select"] = vi.fn(async (params) => {
      const options = (params.options ?? []) as Array<{ value: string }>;
      const qwen = options.find((o) => o.value.includes("Qwen/"));
      return (qwen?.value ?? options[0]?.value ?? "") as never;
    });
    const prompter = createSiliconflowPrompter({ text, select });
    const runtime = createExitThrowingRuntime();

    const result = await runSiliconflowApply({
      authChoice: "siliconflow-api-key",
      config: {},
      prompter,
      runtime,
    });

    expect(result).not.toBeNull();
    expect(result?.config.auth?.profiles?.["siliconflow:default"]).toMatchObject({
      provider: "siliconflow",
      mode: "api_key",
    });
    expect(resolveAgentModelPrimaryValue(result?.config.agents?.defaults?.model)).toBe(
      "siliconflow/Qwen/Qwen2.5-72B-Instruct",
    );

    const parsed = await readAuthProfiles(agentDir);
    expect(parsed.profiles?.["siliconflow:default"]?.key).toBe("sf-test-key");
  });

  it("keeps existing primary when setDefaultModel=false and returns agentModelOverride (siliconflow-cn)", async () => {
    const agentDir = await setupTempState();

    const text = vi.fn().mockResolvedValue("sfcn-test-key");
    const select: WizardPrompter["select"] = vi.fn(async (params) => {
      const options = (params.options ?? []) as Array<{ value: string }>;
      const r1 = options.find((o) => o.value.includes("DeepSeek-R1"));
      return (r1?.value ?? options[0]?.value ?? "") as never;
    });
    const prompter = createSiliconflowPrompter({ text, select });
    const runtime = createExitThrowingRuntime();

    const result = await runSiliconflowApply({
      authChoice: "siliconflow-api-key-cn",
      setDefaultModel: false,
      config: {
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.1-codex" },
          },
        },
      },
      prompter,
      runtime,
    });

    expect(result).not.toBeNull();
    expect(resolveAgentModelPrimaryValue(result?.config.agents?.defaults?.model)).toBe(
      "openai/gpt-5.1-codex",
    );
    expect(result?.agentModelOverride).toBe("siliconflow-cn/deepseek-ai/DeepSeek-R1");
    expect(Object.keys(result?.config.agents?.defaults?.models ?? {})).toContain(
      "siliconflow-cn/deepseek-ai/DeepSeek-R1",
    );

    const parsed = await readAuthProfiles(agentDir);
    expect(parsed.profiles?.["siliconflow-cn:default"]?.key).toBe("sfcn-test-key");
  });
});
