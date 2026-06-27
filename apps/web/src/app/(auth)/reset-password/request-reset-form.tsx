"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressLink } from "@/components/progress-link";
import { authClient } from "@/lib/auth-client";

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    void (async () => {
      try {
        const redirectTo = `${window.location.origin}/login`;
        const result = await authClient.requestPasswordReset({ email, redirectTo });
        if (result.error) throw new Error(result.error.message ?? "Could not send reset email");
        setSent(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If an account exists for <strong>{email}</strong>, a password reset link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
      <div className="pt-2 text-xs text-muted-foreground">
        <ProgressLink href="/login" className="underline">
          Back to sign in
        </ProgressLink>
      </div>
    </form>
  );
}
