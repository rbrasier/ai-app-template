import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core_users } from "./core";

export const ai_conversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => core_users.id, { onDelete: "set null" }),
  title: text("title"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ai_messages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversation_id: uuid("conversation_id")
    .notNull()
    .references(() => ai_conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
