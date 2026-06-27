import { z } from "zod";

// Env vars arrive as strings; treat only "true"/"1" as enabled so an explicit
// "false" is not coerced to true (which z.coerce.boolean would do).
const booleanFromString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_SEED_EMAIL: z.string().email().optional(),
  AI_DEFAULT_PROVIDER: z.enum(["anthropic", "openai", "mistral"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
  AUTH_METHOD: z
    .enum([
      "email-password",
      "magic-link",
      "pki",
      "pki-and-magic-link",
      "google-oauth",
      "other",
      "none",
    ])
    .default("email-password"),
  AUTH_ENABLE_MAGIC_LINK: booleanFromString.default("false"),
  AUTH_ENABLE_ENTRA: booleanFromString.default("false"),
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),
  ENTRA_CLIENT_SECRET: z.string().optional(),
  PKI_TRUSTED_PROXY_IPS: z.string().optional(),
  PKI_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),
}).superRefine((env, ctx) => {
  if (!env.AUTH_ENABLE_ENTRA) return;
  for (const key of ["ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET"] as const) {
    if (!env[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when AUTH_ENABLE_ENTRA is true.`,
      });
    }
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;
export const serverEnv = (): ServerEnv => {
  if (cached) return cached;
  cached = serverEnvSchema.parse(process.env);
  return cached;
};
