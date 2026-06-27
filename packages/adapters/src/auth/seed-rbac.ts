import { ADMIN_ROLE_KEY, EVERYONE_ROLE_KEY, PERMISSION_CATALOG } from "@rbrasier/domain";
import type { Database } from "../db/client";
import { core_permissions, core_roles } from "../db/schema/core";

interface SeedRoleDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/**
 * The two roles every project starts with. `everyone` is the editable base role
 * (seeded with no permissions); `admin` is the immutable wildcard whose
 * authority is sourced from `core_users.is_admin`, so it stores no permission
 * rows. Both are marked is_system and cannot be deleted.
 */
export const SYSTEM_ROLES: readonly SeedRoleDefinition[] = [
  {
    key: EVERYONE_ROLE_KEY,
    name: "Everyone",
    description: "Base role assigned to every user.",
  },
  {
    key: ADMIN_ROLE_KEY,
    name: "Admin",
    description: "Full access. Holds every permission and cannot be modified.",
  },
];

/**
 * Inserts the permission catalog and the two system roles. Idempotent — safe to
 * call on every boot after migrations. Existing rows are left untouched so an
 * admin's edits to the everyone role survive restarts.
 */
export const seedRbac = async (db: Database): Promise<void> => {
  await db
    .insert(core_permissions)
    .values(
      PERMISSION_CATALOG.map((permission) => ({
        key: permission.key,
        description: permission.description,
      })),
    )
    .onConflictDoNothing({ target: core_permissions.key });

  await db
    .insert(core_roles)
    .values(
      SYSTEM_ROLES.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        is_system: true,
      })),
    )
    .onConflictDoNothing({ target: core_roles.key });
};
