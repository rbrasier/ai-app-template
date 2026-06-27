import { describe, it, expect } from "vitest";
import {
  appSettingsSchema,
  defaultAppSettings,
  settingsUpdateSchema,
  type DefaultSettingsEnv,
} from "../app-settings";

const baseEnv: DefaultSettingsEnv = {
  AUTH_METHOD: "email-password",
  AUTH_ENABLE_MAGIC_LINK: false,
  AUTH_ENABLE_ENTRA: false,
  AI_DEFAULT_PROVIDER: "anthropic",
};

describe("appSettingsSchema", () => {
  it("accepts a fully-specified settings object", () => {
    const parsed = appSettingsSchema.safeParse({
      auth: {
        method: "magic-link",
        enableMagicLink: true,
        enableEntra: false,
        allowRegistrationWithoutApproval: true,
      },
      ai: {
        provider: "openai",
        defaultModel: "gpt-4o-mini",
        temperature: 0.7,
        secrets: { openai: "cipher-text" },
      },
      extended: { featureX: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown provider", () => {
    const parsed = appSettingsSchema.safeParse({
      auth: {
        method: "email-password",
        enableMagicLink: false,
        enableEntra: false,
        allowRegistrationWithoutApproval: false,
      },
      ai: { provider: "gemini", secrets: {} },
      extended: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a temperature above the allowed range", () => {
    const parsed = appSettingsSchema.safeParse({
      auth: {
        method: "email-password",
        enableMagicLink: false,
        enableEntra: false,
        allowRegistrationWithoutApproval: false,
      },
      ai: { provider: "anthropic", temperature: 5, secrets: {} },
      extended: {},
    });
    expect(parsed.success).toBe(false);
  });
});

describe("defaultAppSettings", () => {
  it("derives auth and ai config from env", () => {
    const settings = defaultAppSettings({
      ...baseEnv,
      AUTH_METHOD: "magic-link",
      AUTH_ENABLE_MAGIC_LINK: true,
      AI_DEFAULT_PROVIDER: "mistral",
    });
    expect(settings.auth.method).toBe("magic-link");
    expect(settings.auth.enableMagicLink).toBe(true);
    expect(settings.ai.provider).toBe("mistral");
  });

  it("requires approval by default", () => {
    const settings = defaultAppSettings(baseEnv);
    expect(settings.auth.allowRegistrationWithoutApproval).toBe(false);
  });

  it("starts with no stored secrets — env keys are the fallback, not seeded defaults", () => {
    const settings = defaultAppSettings(baseEnv);
    expect(settings.ai.secrets).toEqual({});
  });

  it("produces an object the schema accepts", () => {
    expect(appSettingsSchema.safeParse(defaultAppSettings(baseEnv)).success).toBe(true);
  });
});

describe("settingsUpdateSchema", () => {
  it("accepts a partial patch touching only the auth section", () => {
    const parsed = settingsUpdateSchema.safeParse({
      auth: { allowRegistrationWithoutApproval: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts plaintext secret entries in an ai patch", () => {
    const parsed = settingsUpdateSchema.safeParse({
      ai: { provider: "openai", secrets: { openai: "sk-plaintext" } },
    });
    expect(parsed.success).toBe(true);
  });
});
