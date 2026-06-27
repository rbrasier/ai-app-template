export interface PermissionDefinition {
  readonly key: string;
  readonly description: string;
}

/**
 * The seeded set of capability flags. Adding a feature that needs its own
 * authorization gate means adding an entry here and checking it at the call
 * site. The seeder (adapters) and the admin UI both read from this catalog.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: "users.read", description: "View users" },
  { key: "users.write", description: "Create and edit users" },
  { key: "users.delete", description: "Delete users" },
  { key: "roles.read", description: "View roles and permissions" },
  { key: "roles.manage", description: "Create, edit, and delete roles" },
  { key: "flags.read", description: "View feature flags" },
  { key: "flags.manage", description: "Create and edit feature flags" },
  { key: "errors.read", description: "View error logs" },
  { key: "errors.manage", description: "Change error log status" },
  { key: "usage.read", description: "View usage and cost reporting" },
  { key: "settings.manage", description: "Change application settings" },
];

/**
 * The single authorization rule for the whole app. Admins satisfy every check
 * (the admin role is an immutable wildcard, sourced from `core_users.is_admin`);
 * everyone else is granted only what their assigned roles confer.
 */
export const hasPermission = (
  isAdmin: boolean,
  grantedPermissionKeys: readonly string[],
  required: string,
): boolean => {
  if (isAdmin) return true;
  return grantedPermissionKeys.includes(required);
};
