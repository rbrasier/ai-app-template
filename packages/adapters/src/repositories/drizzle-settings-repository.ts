import {
  domainError,
  err,
  ok,
  type ISettingsRepository,
  type Result,
  type StoredSettings,
} from "@rbrasier/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { admin_settings } from "../db/schema/admin";

/**
 * Persists the singleton settings row. Each section maps to its own jsonb
 * column: `login_settings` ↔ auth, `ai_configuration` ↔ ai, `extended_settings`
 * ↔ extended.
 */
export class DrizzleSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Database) {}

  async load(): Promise<Result<StoredSettings | null>> {
    try {
      const [row] = await this.db.select().from(admin_settings).limit(1);
      if (!row) return ok(null);
      return ok({
        auth: row.login_settings,
        ai: row.ai_configuration,
        extended: row.extended_settings,
      });
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to load settings.", cause));
    }
  }

  async save(stored: StoredSettings): Promise<Result<StoredSettings>> {
    try {
      const values = {
        login_settings: stored.auth,
        ai_configuration: stored.ai,
        extended_settings: stored.extended,
        updated_at: new Date(),
      };
      const [existing] = await this.db
        .select({ id: admin_settings.id })
        .from(admin_settings)
        .limit(1);
      if (existing) {
        await this.db.update(admin_settings).set(values).where(eq(admin_settings.id, existing.id));
      } else {
        await this.db.insert(admin_settings).values(values);
      }
      return ok(stored);
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to save settings.", cause));
    }
  }
}
