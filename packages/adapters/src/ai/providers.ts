import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";
import type { ProviderName } from "@rbrasier/domain";

interface ProviderEntry {
  readonly defaultModel: string;
  // apiKey is optional: when omitted the SDK falls back to its provider env var,
  // letting the settings store supply a runtime key without a redeploy.
  readonly resolve: (model: string, apiKey?: string) => LanguageModel;
}

/**
 * Registry of providers. To add a new provider:
 *   1. `pnpm add @ai-sdk/<name>` in this package.
 *   2. Add a new entry below with its default model + resolver.
 *   3. Add the literal name to ProviderName in @rbrasier/domain.
 * Nothing else changes.
 */
const PROVIDERS = {
  anthropic: {
    defaultModel: "claude-haiku-4-5-20251001",
    resolve: (model: string, apiKey?: string) =>
      createAnthropic(apiKey ? { apiKey } : {})(model),
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    resolve: (model: string, apiKey?: string) => createOpenAI(apiKey ? { apiKey } : {})(model),
  },
  mistral: {
    defaultModel: "mistral-small-latest",
    resolve: (model: string, apiKey?: string) => createMistral(apiKey ? { apiKey } : {})(model),
  },
} as const satisfies Record<ProviderName, ProviderEntry>;

export const resolveModel = (
  provider: ProviderName,
  model?: string,
  apiKey?: string,
): LanguageModel => {
  const entry = PROVIDERS[provider];
  return entry.resolve(model ?? entry.defaultModel, apiKey);
};

export const defaultModelFor = (provider: ProviderName): string =>
  PROVIDERS[provider].defaultModel;
