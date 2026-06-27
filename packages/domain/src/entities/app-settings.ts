import type { ProviderName } from "../ports/language-model";

// Mirrors the AUTH_METHOD env enum. The active method plus additive toggles
// drive which sign-in options the front door exposes.
export type AuthMethod =
  | "email-password"
  | "magic-link"
  | "pki"
  | "pki-and-magic-link"
  | "google-oauth"
  | "other"
  | "none";

export interface AuthSettings {
  readonly method: AuthMethod;
  readonly enableMagicLink: boolean;
  readonly enableEntra: boolean;
  readonly allowRegistrationWithoutApproval: boolean;
}

// Per-provider API keys. Held as ciphertext at rest; only decrypted at the AI
// resolution boundary, never returned to clients.
export interface AiSecrets {
  readonly anthropic?: string;
  readonly openai?: string;
  readonly mistral?: string;
}

export interface AiSettings {
  readonly provider: ProviderName;
  readonly defaultModel?: string;
  readonly temperature?: number;
  readonly secrets: AiSecrets;
}

/**
 * The fully-resolved runtime configuration: defaults from env merged with the
 * admin overrides persisted in the database. Each section maps to one jsonb
 * column on `admin_settings`; `extended` is a forward-compatible catch-all.
 */
export interface AppSettings {
  readonly auth: AuthSettings;
  readonly ai: AiSettings;
  readonly extended: Record<string, unknown>;
}
