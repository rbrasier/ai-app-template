"use client";

import { ADMIN_ROLE_KEY } from "@rbrasier/domain";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc/client";

interface PermissionOption {
  readonly key: string;
  readonly description: string | null;
}

interface RoleView {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissionKeys: readonly string[];
}

function PermissionGrid({
  permissions,
  selected,
  disabled,
  onToggle,
}: {
  permissions: readonly PermissionOption[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {permissions.map((permission) => (
        <label key={permission.key} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={selected.has(permission.key)}
            disabled={disabled}
            onChange={() => onToggle(permission.key)}
          />
          <span>
            <span className="font-mono text-xs">{permission.key}</span>
            {permission.description ? (
              <span className="block text-xs text-muted-foreground">{permission.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function RoleCard({
  role,
  permissions,
  onSaved,
}: {
  role: RoleView;
  permissions: readonly PermissionOption[];
  onSaved: () => void;
}) {
  const isAdmin = role.key === ADMIN_ROLE_KEY;
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissionKeys));
  const [error, setError] = useState<string | null>(null);

  const update = trpc.role.update.useMutation({
    onSuccess: () => {
      onSaved();
      void utils.role.list.invalidate();
    },
    onError: (caught) => setError(caught.message),
  });
  const remove = trpc.role.delete.useMutation({
    onSuccess: () => void utils.role.list.invalidate(),
    onError: (caught) => setError(caught.message),
  });

  // The admin role is an immutable wildcard: show every permission ticked and locked.
  const effectiveSelected = isAdmin ? new Set(permissions.map((permission) => permission.key)) : selected;

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {role.name}
          <span className="font-mono text-xs text-muted-foreground">{role.key}</span>
          {isAdmin ? <Badge>immutable</Badge> : role.isSystem ? <Badge variant="outline">system</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PermissionGrid
          permissions={permissions}
          selected={effectiveSelected}
          disabled={isAdmin}
          onToggle={toggle}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isAdmin ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() => {
                setError(null);
                update.mutate({ id: role.id, permissionKeys: [...selected] });
              }}
            >
              {update.isPending ? "Saving…" : "Save permissions"}
            </Button>
            {!role.isSystem ? (
              <Button
                size="sm"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  setError(null);
                  remove.mutate({ id: role.id });
                }}
              >
                Delete role
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function AdminRolesPage() {
  const utils = trpc.useUtils();
  const rolesQuery = trpc.role.list.useQuery();
  const permissionsQuery = trpc.role.listPermissions.useQuery();

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const create = trpc.role.create.useMutation({
    onSuccess: () => {
      setKey("");
      setName("");
      setSelected(new Set());
      void utils.role.list.invalidate();
    },
    onError: (caught) => setError(caught.message),
  });

  const permissions: PermissionOption[] = permissionsQuery.data ?? [];

  const toggleNew = (permissionKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permissionKey)) next.delete(permissionKey);
      else next.add(permissionKey);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="space-y-1">
              <Label htmlFor="role-key">Key</Label>
              <Input
                id="role-key"
                placeholder="editor"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                placeholder="Editor"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="max-w-xs"
              />
            </div>
          </div>
          <PermissionGrid permissions={permissions} selected={selected} disabled={false} onToggle={toggleNew} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            disabled={create.isPending || !key.trim() || !name.trim()}
            onClick={() => {
              setError(null);
              create.mutate({ key: key.trim(), name: name.trim(), permissionKeys: [...selected] });
            }}
          >
            {create.isPending ? "Creating…" : "Create role"}
          </Button>
        </CardContent>
      </Card>

      {rolesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {rolesQuery.data?.map((role) => (
            <RoleCard key={role.id} role={role} permissions={permissions} onSaved={() => undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
