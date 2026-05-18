import { randomBytes } from "node:crypto";

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isDatabaseUrl(value: string): boolean {
  return value.includes("://");
}

export function buildDatabaseUrl(dbName: string): string {
  return `postgresql://postgres:postgres@localhost:5432/${dbName}`;
}

/**
 * Replaces env var values in a .env file's text content.
 * Only replaces lines matching `KEY=<anything>` exactly; ignores comments.
 */
export function patchEnvContent(
  content: string,
  replacements: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`^(${key}=).*$`, "m"), `$1${value}`);
  }
  return result;
}
