import "server-only";
import { getContainer } from "./container";

/**
 * Constrains a post-auth redirect target to a same-site relative path, so a
 * crafted `?next=` cannot bounce the user to an external origin.
 */
export function safeNext(next: string | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export interface PublicAuthMethods {
  readonly emailPassword: boolean;
  readonly magicLink: boolean;
  readonly entra: boolean;
  readonly isDev: boolean;
}

/**
 * Resolves the enabled sign-in methods from the live settings store so the auth
 * pages reflect admin changes without a redeploy. Secrets are never read here.
 */
export async function getAuthMethods(): Promise<PublicAuthMethods> {
  const container = getContainer();
  const settings = await container.settingsService.get();
  const auth = settings.data?.auth;
  const method = auth?.method ?? "email-password";
  return {
    emailPassword: method === "email-password",
    magicLink:
      method === "magic-link" ||
      method === "pki-and-magic-link" ||
      (auth?.enableMagicLink ?? false),
    entra: auth?.enableEntra ?? false,
    isDev: container.env.NODE_ENV === "development",
  };
}
