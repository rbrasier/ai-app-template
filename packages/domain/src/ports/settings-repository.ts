import type { Result } from "../result";

/**
 * Raw persisted settings — one record per `admin_settings` jsonb column. The
 * repository stays oblivious to the validated shape; merging defaults and
 * validation live in the application layer's SettingsService.
 */
export interface StoredSettings {
  readonly auth: Record<string, unknown>;
  readonly ai: Record<string, unknown>;
  readonly extended: Record<string, unknown>;
}

export interface ISettingsRepository {
  // Resolves to null when the singleton row has not been seeded yet.
  load(): Promise<Result<StoredSettings | null>>;
  save(stored: StoredSettings): Promise<Result<StoredSettings>>;
}
