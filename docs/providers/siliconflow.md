---
summary: "SiliconFlow setup (auth + model selection) for OpenAI-compatible chat completions"
read_when:
  - You want to use SiliconFlow with OpenClaw
  - You need the SiliconFlow env vars, base URLs, or onboarding flags
title: "SiliconFlow"
---

# SiliconFlow

OpenClaw supports SiliconFlow as an **OpenAI-compatible Chat Completions** provider.

- Providers:
  - `siliconflow` (base URL `https://api.siliconflow.com/v1`, env `SILICONFLOW_API_KEY`)
  - `siliconflow-cn` (base URL `https://api.siliconflow.cn/v1`, env `SILICONFLOW_CN_API_KEY`)
- Model refs use `provider/model` (example: `siliconflow/deepseek-ai/DeepSeek-R1`).
- Model IDs can include `/` (for example `deepseek-ai/DeepSeek-R1` or `Qwen/Qwen2.5-72B-Instruct`).

## Interactive onboarding

Run onboarding and choose SiliconFlow, then pick a model from the discovered `/v1/models` list:

```bash
openclaw onboard --auth-choice siliconflow-api-key
```

China endpoint:

```bash
openclaw onboard --auth-choice siliconflow-api-key-cn
```

## Non-interactive examples

SiliconFlow (.com):

```bash
openclaw onboard --non-interactive --accept-risk \
  --auth-choice siliconflow-api-key \
  --siliconflow-api-key "$SILICONFLOW_API_KEY" \
  --siliconflow-model-id "deepseek-ai/DeepSeek-R1"
```

SiliconFlow (.cn):

```bash
openclaw onboard --non-interactive --accept-risk \
  --auth-choice siliconflow-api-key-cn \
  --siliconflow-cn-api-key "$SILICONFLOW_CN_API_KEY" \
  --siliconflow-cn-model-id "deepseek-ai/DeepSeek-R1"
```

## Model discovery and strict model IDs

OpenClaw discovers models by calling:

- `GET https://api.siliconflow.com/v1/models`
- `GET https://api.siliconflow.cn/v1/models`

with `Authorization: Bearer <apiKey>`.

During onboarding, model IDs are selected from this discovered catalog (with a small built-in fallback list if the request fails). OpenClaw does **not** do OpenRouter-style “any model id passthrough” fallback.

## Configuration example

```json5
{
  agents: {
    defaults: {
      model: { primary: "siliconflow/deepseek-ai/DeepSeek-R1" },
      models: {
        // allowlist entry (optional but recommended)
        "siliconflow/deepseek-ai/DeepSeek-R1": { alias: "DeepSeek R1" },
      },
    },
  },
  models: {
    mode: "merge",
    providers: {
      siliconflow: {
        baseUrl: "https://api.siliconflow.com/v1",
        api: "openai-completions",
        models: [{ id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" }],
      },
    },
  },
}
```
