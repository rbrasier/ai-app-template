import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";

// OS-generated files that should not be considered project content
const IGNORED_ENTRIES = new Set([".DS_Store", "Thumbs.db", ".Spotlight-V100", ".Trashes"]);

export function isDirectoryEmpty(dirPath: string): boolean {
  const entries = readdirSync(dirPath);
  return entries.every((entry) => IGNORED_ENTRIES.has(entry));
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isDatabaseUrl(value: string): boolean {
  return value.includes("://");
}

export function buildDatabaseUrl(dbName: string): string {
  return `postgresql://postgres:postgres@localhost:5432/${dbName}`;
}

export function buildPackFilename(packsDir: string, scopeSlug: string, pkg: string, pkgVersion: string): string {
  return `file:${packsDir}/${scopeSlug}-${pkg}-${pkgVersion}.tgz`;
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
