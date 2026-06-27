import { z } from "zod";

export const authMethodSchema = z.enum([
  "email-password",
  "magic-link",
  "pki",
  "pki-and-magic-link",
  "google-oauth",
  "other",
  "none",
]);

export const aiProviderSchema = z.enum(["anthropic", "openai", "mistral"]);

// Secrets hold ciphertext at rest; the shape is identical for stored and patch
// forms — the difference is plaintext-in / ciphertext-stored, enforced by the
// SettingsService, not the schema.
const aiSecretsSchema = z.object({
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  mistral: z.string().optional(),
});

export const appSettingsSchema = z.object({
  auth: z.object({
    method: authMethodSchema,
    enableMagicLink: z.boolean(),
    enableEntra: z.boolean(),
    allowRegistrationWithoutApproval: z.boolean(),
  }),
  ai: z.object({
    provider: aiProviderSchema,
    defaultModel: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    secrets: aiSecretsSchema,
  }),
  extended: z.record(z.unknown()),
});

export type AppSettingsShape = z.infer<typeof appSettingsSchema>;

/**
 * Admin-supplied patch. Every section and field is optional so a card can save
 * just its own slice. Secret values arrive as plaintext (or blank to keep the
 * existing key) and are encrypted by the SettingsService before persistence.
 */
export const settingsUpdateSchema = z.object({
  auth: z
    .object({
      method: authMethodSchema.optional(),
      enableMagicLink: z.boolean().optional(),
      enableEntra: z.boolean().optional(),
      allowRegistrationWithoutApproval: z.boolean().optional(),
    })
    .optional(),
  ai: z
    .object({
      provider: aiProviderSchema.optional(),
      defaultModel: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      secrets: aiSecretsSchema.optional(),
    })
    .optional(),
  extended: z.record(z.unknown()).optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

// What the settings router returns: identical to AppSettings but with secrets
// flattened to a presence map so plaintext/ciphertext never crosses the wire.
export interface RedactedAppSettings {
  readonly auth: AppSettingsShape["auth"];
  readonly ai: {
    readonly provider: z.infer<typeof aiProviderSchema>;
    readonly defaultModel?: string;
    readonly temperature?: number;
    readonly secrets: Record<"anthropic" | "openai" | "mistral", "set" | "unset">;
  };
  readonly extended: Record<string, unknown>;
  // Per-section hint so the UI can show whether a value comes from env or DB.
  readonly source: { readonly auth: "environment" | "database"; readonly ai: "environment" | "database" };
}

export interface DefaultSettingsEnv {
  readonly AUTH_METHOD: z.infer<typeof authMethodSchema>;
  readonly AUTH_ENABLE_MAGIC_LINK: boolean;
  readonly AUTH_ENABLE_ENTRA: boolean;
  readonly AI_DEFAULT_PROVIDER: z.infer<typeof aiProviderSchema>;
}

/**
 * The fallback configuration derived purely from environment. Secrets stay empty
 * here: env API keys are resolved as a fallback at the AI boundary, not folded
 * into the stored settings. Approval is required by default — opening the door
 * is an explicit admin choice.
 */
export function defaultAppSettings(env: DefaultSettingsEnv): AppSettingsShape {
  return {
    auth: {
      method: env.AUTH_METHOD,
      enableMagicLink: env.AUTH_ENABLE_MAGIC_LINK,
      enableEntra: env.AUTH_ENABLE_ENTRA,
      allowRegistrationWithoutApproval: false,
    },
    ai: {
      provider: env.AI_DEFAULT_PROVIDER,
      secrets: {},
    },
    extended: {},
  };
}
