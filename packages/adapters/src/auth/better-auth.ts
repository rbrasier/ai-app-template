import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import type { Database } from "../db/client";

export interface AuthConfig {
  readonly secret: string;
  readonly baseURL: string;
  readonly adminSeedEmail: string | undefined;
  readonly sendMagicLink: (params: { email: string; url: string }) => Promise<void>;
}

/**
 * Minimal structural surface of the Better Auth instance that this template
 * actually uses. Declared explicitly so TypeScript does not have to spell out
 * Better Auth's full inferred type — which transitively references zod's
 * internal modules and breaks portable declaration emit across packages.
 *
 * Add fields here as the auth surface grows.
 */
export interface Auth {
  readonly handler: (req: Request) => Promise<Response>;
  readonly api: Readonly<Record<string, unknown>>;
}

/**
 * Constructs a Better Auth instance backed by Drizzle.
 *
 * The first user signing in with ADMIN_SEED_EMAIL is promoted to admin via
 * `seedAdmin` — call it once from the app's container after migrations.
 */
export const createAuth = (db: Database, config: AuthConfig): Auth =>
  betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: config.secret,
    baseURL: config.baseURL,
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendMagicLink({ email, url });
        },
      }),
    ],
  }) as unknown as Auth;
