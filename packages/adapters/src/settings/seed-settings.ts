import type { ISecretCipher, ISettingsRepository } from "@rbrasier/domain";

export interface SettingsSeedEnv {
  readonly AUTH_METHOD:
    | "email-password"
    | "magic-link"
    | "pki"
    | "pki-and-magic-link"
    | "google-oauth"
    | "other"
    | "none";
  readonly AUTH_ENABLE_MAGIC_LINK: boolean;
  readonly AUTH_ENABLE_ENTRA: boolean;
  readonly AI_DEFAULT_PROVIDER: "anthropic" | "openai" | "mistral";
  readonly ANTHROPIC_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
  readonly MISTRAL_API_KEY?: string;
}

/**
 * Seeds the singleton settings row from environment on first boot. Idempotent:
 * no-ops once a row exists, so admin edits are never overwritten. Env API keys
 * are encrypted into the row; approval is required by default.
 */
export const seedSettings = async (
  repository: ISettingsRepository,
  cipher: ISecretCipher,
  env: SettingsSeedEnv,
): Promise<void> => {
  const loaded = await repository.load();
  if (loaded.error || loaded.data) return;

  const secrets: Record<string, string> = {};
  const envKeys: ReadonlyArray<[string, string | undefined]> = [
    ["anthropic", env.ANTHROPIC_API_KEY],
    ["openai", env.OPENAI_API_KEY],
    ["mistral", env.MISTRAL_API_KEY],
  ];
  for (const [provider, key] of envKeys) {
    if (!key) continue;
    const encrypted = cipher.encrypt(key);
    if (encrypted.data) secrets[provider] = encrypted.data;
  }

  await repository.save({
    auth: {
      method: env.AUTH_METHOD,
      enableMagicLink: env.AUTH_ENABLE_MAGIC_LINK,
      enableEntra: env.AUTH_ENABLE_ENTRA,
      allowRegistrationWithoutApproval: false,
    },
    ai: { provider: env.AI_DEFAULT_PROVIDER, secrets },
    extended: {},
  });
};
