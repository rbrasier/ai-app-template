import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url(),
  AI_DEFAULT_PROVIDER: z.enum(["anthropic", "openai", "mistral"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (): Env => envSchema.parse(process.env);
