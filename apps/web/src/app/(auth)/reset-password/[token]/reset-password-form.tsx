"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressLink } from "@/components/progress-link";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    void (async () => {
      try {
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) throw new Error(result.error.message ?? "Could not reset password");
        setDone(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  if (done) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Your password has been updated.</p>
        <ProgressLink href="/login" className="underline">
          Sign in
        </ProgressLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
