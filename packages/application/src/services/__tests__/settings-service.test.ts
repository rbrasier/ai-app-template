import { describe, it, expect } from "vitest";
import {
  ok,
  type ISecretCipher,
  type ISettingsRepository,
  type Result,
  type StoredSettings,
} from "@rbrasier/domain";
import { defaultAppSettings, type DefaultSettingsEnv } from "@rbrasier/shared";
import { SettingsService } from "../settings-service";

const env: DefaultSettingsEnv = {
  AUTH_METHOD: "email-password",
  AUTH_ENABLE_MAGIC_LINK: false,
  AUTH_ENABLE_ENTRA: false,
  AI_DEFAULT_PROVIDER: "anthropic",
};

// Reversible stand-in for AES so tests can assert ciphertext != plaintext while
// still round-tripping through decrypt.
class ReversibleCipher implements ISecretCipher {
  encrypt(plaintext: string): Result<string> {
    return ok(`enc(${plaintext})`);
  }
  decrypt(ciphertext: string): Result<string> {
    const match = ciphertext.match(/^enc\((.*)\)$/);
    return ok(match ? match[1]! : ciphertext);
  }
}

class InMemorySettingsRepo implements ISettingsRepository {
  loadCalls = 0;
  constructor(private row: StoredSettings | null = null) {}
  async load(): Promise<Result<StoredSettings | null>> {
    this.loadCalls += 1;
    return ok(this.row);
  }
  async save(stored: StoredSettings): Promise<Result<StoredSettings>> {
    this.row = stored;
    return ok(stored);
  }
}

const build = (row: StoredSettings | null = null, fallbackKeys = {}) => {
  const repo = new InMemorySettingsRepo(row);
  const service = new SettingsService(
    repo,
    new ReversibleCipher(),
    defaultAppSettings(env),
    fallbackKeys,
  );
  return { repo, service };
};

describe("SettingsService.get", () => {
  it("falls back to env defaults when no row is stored", async () => {
    const { service } = build(null);
    const result = await service.get();
    expect(result.data?.ai.provider).toBe("anthropic");
    expect(result.data?.auth.method).toBe("email-password");
  });

  it("lets the stored DB value win over the env default", async () => {
    const { service } = build({
      auth: { method: "magic-link" },
      ai: { provider: "openai" },
      extended: {},
    });
    const result = await service.get();
    expect(result.data?.ai.provider).toBe("openai");
    expect(result.data?.auth.method).toBe("magic-link");
  });

  it("caches — a second get does not re-read the repository", async () => {
    const { repo, service } = build(null);
    await service.get();
    await service.get();
    expect(repo.loadCalls).toBe(1);
  });
});

describe("SettingsService.resolveApiKey", () => {
  it("decrypts the stored ciphertext for the provider", async () => {
    const { service } = build({
      auth: {},
      ai: { provider: "anthropic", secrets: { anthropic: "enc(sk-db)" } },
      extended: {},
    });
    const result = await service.resolveApiKey("anthropic");
    expect(result.data).toBe("sk-db");
  });

  it("falls back to the env key when no secret is stored", async () => {
    const { service } = build(null, { anthropic: "sk-env" });
    const result = await service.resolveApiKey("anthropic");
    expect(result.data).toBe("sk-env");
  });
});

describe("SettingsService.update", () => {
  it("encrypts a newly supplied secret before persisting", async () => {
    const { repo, service } = build(null);
    await service.update({ ai: { secrets: { openai: "sk-plain" } } });
    const storedSecret = (repo["row"]?.ai as { secrets?: Record<string, string> })?.secrets?.openai;
    expect(storedSecret).toBe("enc(sk-plain)");
    expect(storedSecret).not.toBe("sk-plain");
  });

  it("keeps the existing secret when the patch value is blank", async () => {
    const { service } = build({
      auth: {},
      ai: { provider: "anthropic", secrets: { anthropic: "enc(sk-keep)" } },
      extended: {},
    });
    await service.update({ ai: { secrets: { anthropic: "" } } });
    const result = await service.resolveApiKey("anthropic");
    expect(result.data).toBe("sk-keep");
  });

  it("invalidates the cache and bumps the version on save", async () => {
    const { service } = build(null);
    const before = service.version();
    await service.update({ auth: { allowRegistrationWithoutApproval: true } });
    const after = await service.get();
    expect(after.data?.auth.allowRegistrationWithoutApproval).toBe(true);
    expect(service.version()).toBeGreaterThan(before);
  });
});

describe("SettingsService.getRedacted", () => {
  it("reports secret presence without leaking plaintext", async () => {
    const { service } = build(
      { auth: {}, ai: { provider: "anthropic", secrets: { anthropic: "enc(sk-secret)" } }, extended: {} },
      {},
    );
    const result = await service.getRedacted();
    expect(result.data?.ai.secrets.anthropic).toBe("set");
    expect(result.data?.ai.secrets.openai).toBe("unset");
    expect(JSON.stringify(result.data)).not.toContain("sk-secret");
  });
});
