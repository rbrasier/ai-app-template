import {
  domainError,
  err,
  ok,
  type ISecretCipher,
  type ISettingsRepository,
  type ProviderName,
  type Result,
  type StoredSettings,
} from "@rbrasier/domain";
import {
  appSettingsSchema,
  type AppSettingsShape,
  type RedactedAppSettings,
  type SettingsUpdateInput,
} from "@rbrasier/shared";

const PROVIDERS: readonly ProviderName[] = ["anthropic", "openai", "mistral"];

// Deep-merges stored overrides on top of env defaults, section by section, with
// DB winning per field. Returns a loose object for the schema to validate.
function mergeStoredOverDefaults(
  defaults: AppSettingsShape,
  stored: StoredSettings | null,
): unknown {
  if (!stored) return defaults;
  const storedAi = (stored.ai ?? {}) as Record<string, unknown>;
  const storedSecrets = (storedAi.secrets ?? {}) as Record<string, unknown>;
  const { secrets: _droppedSecrets, ...storedAiRest } = storedAi;
  return {
    auth: { ...defaults.auth, ...(stored.auth ?? {}) },
    ai: {
      ...defaults.ai,
      ...storedAiRest,
      secrets: { ...defaults.ai.secrets, ...storedSecrets },
    },
    extended: { ...defaults.extended, ...(stored.extended ?? {}) },
  };
}

/**
 * Resolves runtime settings as env defaults merged with admin DB overrides.
 * Caches the resolved object in-process and invalidates on save; `version`
 * lets the container detect auth-affecting changes and rebuild lazily. Secrets
 * live as ciphertext in the resolved object — only `resolveApiKey` decrypts.
 */
export class SettingsService {
  private cache: AppSettingsShape | null = null;
  private storedSnapshot: StoredSettings | null = null;
  private revision = 0;

  constructor(
    private readonly repository: ISettingsRepository,
    private readonly cipher: ISecretCipher,
    private readonly defaults: AppSettingsShape,
    private readonly fallbackKeys: Partial<Record<ProviderName, string>>,
  ) {}

  version(): number {
    return this.revision;
  }

  async get(): Promise<Result<AppSettingsShape>> {
    if (this.cache) return ok(this.cache);
    const loaded = await this.repository.load();
    if (loaded.error) return err(loaded.error);
    this.storedSnapshot = loaded.data;
    const parsed = appSettingsSchema.safeParse(
      mergeStoredOverDefaults(this.defaults, loaded.data),
    );
    if (!parsed.success) {
      return err(domainError("VALIDATION_FAILED", "Stored settings failed validation.", parsed.error));
    }
    this.cache = parsed.data;
    return ok(this.cache);
  }

  async resolveApiKey(provider: ProviderName): Promise<Result<string | null>> {
    const settings = await this.get();
    if (settings.error) return err(settings.error);
    const ciphertext = settings.data.ai.secrets[provider];
    if (ciphertext) return this.cipher.decrypt(ciphertext);
    return ok(this.fallbackKeys[provider] ?? null);
  }

  async getRedacted(): Promise<Result<RedactedAppSettings>> {
    const settings = await this.get();
    if (settings.error) return err(settings.error);
    const data = settings.data;
    const presence = (provider: ProviderName): "set" | "unset" =>
      data.ai.secrets[provider] || this.fallbackKeys[provider] ? "set" : "unset";

    return ok({
      auth: data.auth,
      ai: {
        provider: data.ai.provider,
        defaultModel: data.ai.defaultModel,
        temperature: data.ai.temperature,
        secrets: {
          anthropic: presence("anthropic"),
          openai: presence("openai"),
          mistral: presence("mistral"),
        },
      },
      extended: data.extended,
      source: {
        auth: this.sectionSource("auth"),
        ai: this.sectionSource("ai"),
      },
    });
  }

  async update(patch: SettingsUpdateInput): Promise<Result<AppSettingsShape>> {
    const current = await this.get();
    if (current.error) return err(current.error);
    const base = current.data;

    const secrets: Record<string, string> = { ...base.ai.secrets };
    for (const provider of PROVIDERS) {
      const supplied = patch.ai?.secrets?.[provider];
      // undefined = untouched; blank = keep existing key; otherwise re-encrypt.
      if (supplied === undefined || supplied.trim() === "") continue;
      const encrypted = this.cipher.encrypt(supplied);
      if (encrypted.error) return err(encrypted.error);
      secrets[provider] = encrypted.data;
    }

    const next = {
      auth: { ...base.auth, ...(patch.auth ?? {}) },
      ai: {
        provider: patch.ai?.provider ?? base.ai.provider,
        defaultModel: patch.ai?.defaultModel ?? base.ai.defaultModel,
        temperature: patch.ai?.temperature ?? base.ai.temperature,
        secrets,
      },
      extended: { ...base.extended, ...(patch.extended ?? {}) },
    };

    const parsed = appSettingsSchema.safeParse(next);
    if (!parsed.success) {
      return err(domainError("VALIDATION_FAILED", "Updated settings failed validation.", parsed.error));
    }

    const saved = await this.repository.save({
      auth: parsed.data.auth,
      ai: parsed.data.ai,
      extended: parsed.data.extended,
    });
    if (saved.error) return err(saved.error);

    this.cache = null;
    this.revision += 1;
    return this.get();
  }

  private sectionSource(section: "auth" | "ai"): "environment" | "database" {
    const stored = this.storedSnapshot?.[section];
    return stored && Object.keys(stored).length > 0 ? "database" : "environment";
  }
}
