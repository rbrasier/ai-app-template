import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// Singleton runtime configuration row. Each settings group is its own jsonb
// column so unrelated sections (AI vs login) can be patched without clobbering
// one another, and `extended_settings` absorbs future sections without a
// migration. Secrets are stored as ciphertext within their column.
export const admin_settings = pgTable("admin_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ai_configuration: jsonb("ai_configuration")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  login_settings: jsonb("login_settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  extended_settings: jsonb("extended_settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
