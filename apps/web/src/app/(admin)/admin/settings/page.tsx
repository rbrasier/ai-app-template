"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc/client";

const AUTH_METHODS = [
  "email-password",
  "magic-link",
  "pki",
  "pki-and-magic-link",
  "google-oauth",
  "other",
  "none",
] as const;

const PROVIDERS = ["anthropic", "openai", "mistral"] as const;
const SECRET_PROVIDERS = ["anthropic", "openai", "mistral"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm";

function SourceBadge({ source }: { source: "environment" | "database" }) {
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {source === "database" ? "set in database" : "from environment"}
    </Badge>
  );
}

export default function AppSettingsPage() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => void utils.settings.get.invalidate(),
  });

  const [authMethod, setAuthMethod] = useState<(typeof AUTH_METHODS)[number]>("email-password");
  const [enableMagicLink, setEnableMagicLink] = useState(false);
  const [enableEntra, setEnableEntra] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(false);

  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("anthropic");
  const [defaultModel, setDefaultModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});

  const data = settingsQuery.data;
  useEffect(() => {
    if (!data) return;
    setAuthMethod(data.auth.method);
    setEnableMagicLink(data.auth.enableMagicLink);
    setEnableEntra(data.auth.enableEntra);
    setAllowRegistration(data.auth.allowRegistrationWithoutApproval);
    setProvider(data.ai.provider);
    setDefaultModel(data.ai.defaultModel ?? "");
    setTemperature(data.ai.temperature !== undefined ? String(data.ai.temperature) : "");
  }, [data]);

  const saveLogin = () =>
    update.mutate({
      auth: {
        method: authMethod,
        enableMagicLink,
        enableEntra,
        allowRegistrationWithoutApproval: allowRegistration,
      },
    });

  const saveAi = () => {
    const secrets: Record<string, string> = {};
    for (const name of SECRET_PROVIDERS) {
      const value = secretInputs[name];
      if (value && value.trim()) secrets[name] = value.trim();
    }
    update.mutate({
      ai: {
        provider,
        defaultModel: defaultModel.trim() || undefined,
        temperature: temperature.trim() ? Number(temperature) : undefined,
        secrets,
      },
    });
    setSecretInputs({});
  };

  if (settingsQuery.isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Application Settings</h1>
        <p className="text-sm text-muted-foreground">
          Runtime configuration. Database values override environment defaults; changes take
          effect without a redeploy.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Login Methods</CardTitle>
          <SourceBadge source={data.source.auth} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-method">Active method</Label>
            <select
              id="auth-method"
              className={selectClass}
              value={authMethod}
              onChange={(event) => setAuthMethod(event.target.value as (typeof AUTH_METHODS)[number])}
            >
              {AUTH_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enableMagicLink}
              onChange={(event) => setEnableMagicLink(event.target.checked)}
            />
            Also enable magic link
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enableEntra}
              onChange={(event) => setEnableEntra(event.target.checked)}
            />
            Also enable Microsoft Entra
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowRegistration}
              onChange={(event) => setAllowRegistration(event.target.checked)}
            />
            Allow users to register without approval
          </label>
          <Button onClick={saveLogin} disabled={update.isPending}>
            Save login methods
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">AI Configuration</CardTitle>
          <SourceBadge source={data.source.ai} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-provider">Provider</Label>
            <select
              id="ai-provider"
              className={selectClass}
              value={provider}
              onChange={(event) => setProvider(event.target.value as (typeof PROVIDERS)[number])}
            >
              {PROVIDERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-model">Default model (optional)</Label>
            <Input
              id="default-model"
              value={defaultModel}
              onChange={(event) => setDefaultModel(event.target.value)}
              placeholder="provider default"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature (optional, 0–2)</Label>
            <Input
              id="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">API keys</p>
            {SECRET_PROVIDERS.map((name) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={`secret-${name}`} className="flex items-center gap-2">
                  {name}
                  <Badge variant={data.ai.secrets[name] === "set" ? "default" : "outline"}>
                    {data.ai.secrets[name]}
                  </Badge>
                </Label>
                <Input
                  id={`secret-${name}`}
                  type="password"
                  value={secretInputs[name] ?? ""}
                  onChange={(event) =>
                    setSecretInputs({ ...secretInputs, [name]: event.target.value })
                  }
                  placeholder={data.ai.secrets[name] === "set" ? "•••••• (leave blank to keep)" : "not set"}
                />
              </div>
            ))}
          </div>

          <Button onClick={saveAi} disabled={update.isPending}>
            Save AI configuration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
