import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  core_accounts,
  core_sessions,
  core_users,
  core_verification_tokens,
} from "../db/schema/core";

export interface MagicLinkMethod {
  readonly sendMagicLink: (params: { email: string; url: string }) => Promise<void>;
}

export interface EntraMethod {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tenantId: string;
}

/**
 * Composable auth strategy selection. Email+password is the default base; magic
 * link and Entra (Azure AD OIDC) are additive and can run alongside it. PKI and
 * the "no auth" mode are handled outside Better Auth (see PkiCertAdapter).
 */
export interface AuthMethodsConfig {
  readonly emailPassword: boolean;
  readonly magicLink?: MagicLinkMethod;
  readonly entra?: EntraMethod;
}

export interface AuthConfig {
  readonly secret: string;
  readonly baseURL: string;
  readonly adminSeedEmail: string | undefined;
  readonly methods: AuthMethodsConfig;
  // New registrations land 'active' when true, otherwise 'pending' approval.
  readonly allowRegistrationWithoutApproval: boolean;
  // Invoked by Better Auth's reset flow with the tokenised reset URL.
  readonly sendPasswordReset?: (input: { email: string; url: string }) => Promise<void>;
}

/**
 * Minimal structural surface of the Better Auth instance that this template
 * actually uses. Declared explicitly so TypeScript does not have to spell out
 * Better Auth's full inferred type — which transitively references zod's
 * internal modules and breaks portable declaration emit across packages.
 */
export interface Auth {
  readonly handler: (req: Request) => Promise<Response>;
  readonly api: Readonly<Record<string, unknown>>;
}

// Maps Better Auth's camelCase model fields onto the template's snake_case
// columns. Fields whose default name already matches a column (name, email,
// image, token, identifier, scope, password) are omitted.
const fieldMapping = {
  user: {
    fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  },
  session: {
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    fields: { value: "token", expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },
} as const;

/**
 * Constructs a Better Auth instance backed by Drizzle.
 *
 * The first user signing in with ADMIN_SEED_EMAIL is promoted to admin via
 * `seedAdmin` — call it once from the app's container after migrations.
 */
export const createAuth = (db: Database, config: AuthConfig): Auth => {
  const plugins = [];

  const magicLinkMethod = config.methods.magicLink;
  if (magicLinkMethod) {
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await magicLinkMethod.sendMagicLink({ email, url });
        },
      }),
    );
  }

  const entra = config.methods.entra;
  if (entra) {
    plugins.push(
      genericOAuth({
        config: [
          microsoftEntraId({
            clientId: entra.clientId,
            clientSecret: entra.clientSecret,
            tenantId: entra.tenantId,
          }),
        ],
      }),
    );
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: core_users,
        session: core_sessions,
        account: core_accounts,
        verification: core_verification_tokens,
      },
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: {
      enabled: config.methods.emailPassword,
      ...(config.sendPasswordReset
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              await config.sendPasswordReset?.({ email: user.email, url });
            },
          }
        : {}),
    },
    user: {
      ...fieldMapping.user,
      // `status` already matches its snake_case column, so no field remap — it is
      // declared here only so Better Auth persists the value our hook sets.
      additionalFields: {
        status: { type: "string", required: false, input: false, defaultValue: "active" },
      },
    },
    session: fieldMapping.session,
    account: fieldMapping.account,
    verification: fieldMapping.verification,
    databaseHooks: {
      user: {
        create: {
          before: async (user: Record<string, unknown>) => ({
            data: {
              ...user,
              status: config.allowRegistrationWithoutApproval ? "active" : "pending",
            },
          }),
        },
      },
      session: {
        create: {
          // Gate session creation (sign-in and post-signup) on user status so
          // pending/rejected accounts cannot hold a session.
          before: async (session: { userId: string }) => {
            const [row] = await db
              .select({ status: core_users.status })
              .from(core_users)
              .where(eq(core_users.id, session.userId))
              .limit(1);
            if (row && row.status !== "active") {
              const message =
                row.status === "pending"
                  ? "Your account is awaiting administrator approval."
                  : "Your account is not permitted to sign in.";
              throw new APIError("FORBIDDEN", { message });
            }
          },
        },
      },
    },
    plugins,
  }) as unknown as Auth;
};
