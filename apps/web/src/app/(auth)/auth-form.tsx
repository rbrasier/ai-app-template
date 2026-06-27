"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressLink } from "@/components/progress-link";
import { ENTRA_PROVIDER_ID, authClient } from "@/lib/auth-client";

export interface AuthMethods {
  readonly emailPassword: boolean;
  readonly magicLink: boolean;
  readonly entra: boolean;
  readonly isDev: boolean;
}

interface AuthFormProps {
  readonly methods: AuthMethods;
  readonly mode: "sign-in" | "sign-up";
  readonly next: string;
}

export function AuthForm({ methods, mode, next }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const onPasswordSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      if (methods.isDev && mode === "sign-in") {
        const response = await fetch("/api/dev-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Login failed");
        }
        window.location.href = next;
        return;
      }

      if (mode === "sign-up") {
        const result = await authClient.signUp.email({ email, password, name: name || email });
        if (result.error) {
          // A blocked session after sign-up means the account is pending approval.
          setNotice(result.error.message ?? "Registration submitted — awaiting approval.");
          return;
        }
        window.location.href = next;
        return;
      }

      const result = await authClient.signIn.email({ email, password, callbackURL: next });
      if (result.error) throw new Error(result.error.message ?? "Login failed");
      window.location.href = next;
    });
  };

  const onMagicLink = (): void =>
    void run(async () => {
      const result = await authClient.signIn.magicLink({ email, callbackURL: next });
      if (result.error) throw new Error(result.error.message ?? "Could not send magic link");
      setMagicLinkSent(true);
    });

  const onEntra = (): void =>
    void run(async () => {
      await authClient.signIn.oauth2({ providerId: ENTRA_PROVIDER_ID, callbackURL: next });
    });

  if (magicLinkSent) {
    return (
      <p className="text-sm text-muted-foreground">
        Check your email — we&apos;ve sent a magic link to <strong>{email}</strong>.
      </p>
    );
  }

  if (notice) {
    return <p className="text-sm text-muted-foreground">{notice}</p>;
  }

  const showPasswordField = methods.emailPassword && !(methods.isDev && mode === "sign-in");

  return (
    <div className="space-y-4">
      {(methods.emailPassword || methods.magicLink || methods.isDev) && (
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          {mode === "sign-up" && showPasswordField && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {showPasswordField && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {(methods.emailPassword || methods.isDev) && (
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Working…"
                : mode === "sign-up"
                  ? "Create account"
                  : "Sign in"}
            </Button>
          )}
        </form>
      )}

      {methods.magicLink && !(methods.isDev && mode === "sign-in") && (
        <Button variant="outline" className="w-full" disabled={submitting} onClick={onMagicLink}>
          Email me a magic link
        </Button>
      )}

      {methods.entra && (
        <Button variant="outline" className="w-full" disabled={submitting} onClick={onEntra}>
          Sign in with Microsoft
        </Button>
      )}

      <div className="flex justify-between pt-2 text-xs text-muted-foreground">
        {mode === "sign-in" ? (
          <>
            {methods.emailPassword && (
              <ProgressLink href={`/register?next=${encodeURIComponent(next)}`} className="underline">
                Need an account? Sign up
              </ProgressLink>
            )}
            {methods.emailPassword && (
              <ProgressLink href="/reset-password" className="underline">
                Forgot password?
              </ProgressLink>
            )}
          </>
        ) : (
          <ProgressLink href={`/login?next=${encodeURIComponent(next)}`} className="underline">
            Have an account? Sign in
          </ProgressLink>
        )}
      </div>
    </div>
  );
}
