import {
  domainError,
  err,
  ok,
  type IRoleRepository,
  type NewRole,
  type Result,
  type Role,
  type RoleUpdate,
} from "@rbrasier/domain";
import { EVERYONE_ROLE_KEY } from "@rbrasier/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  core_permissions,
  core_role_permissions,
  core_roles,
  core_user_roles,
} from "../db/schema/core";

type RoleRow = typeof core_roles.$inferSelect;

const toEntity = (row: RoleRow, permissionKeys: string[]): Role => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  permissionKeys,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DrizzleRoleRepository implements IRoleRepository {
  constructor(private readonly db: Database) {}

  private async permissionKeysByRoleId(roleIds: string[]): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>();
    if (roleIds.length === 0) return grouped;
    const rows = await this.db
      .select({ roleId: core_role_permissions.role_id, key: core_permissions.key })
      .from(core_role_permissions)
      .innerJoin(core_permissions, eq(core_role_permissions.permission_id, core_permissions.id))
      .where(inArray(core_role_permissions.role_id, roleIds));
    for (const row of rows) {
      const keys = grouped.get(row.roleId) ?? [];
      keys.push(row.key);
      grouped.set(row.roleId, keys);
    }
    return grouped;
  }

  private async replacePermissions(roleId: string, permissionKeys: readonly string[]): Promise<void> {
    await this.db.delete(core_role_permissions).where(eq(core_role_permissions.role_id, roleId));
    if (permissionKeys.length === 0) return;
    const permissions = await this.db
      .select({ id: core_permissions.id, key: core_permissions.key })
      .from(core_permissions)
      .where(inArray(core_permissions.key, [...permissionKeys]));
    if (permissions.length === 0) return;
    await this.db
      .insert(core_role_permissions)
      .values(permissions.map((permission) => ({ role_id: roleId, permission_id: permission.id })));
  }

  async list(): Promise<Result<Role[]>> {
    try {
      const rows = await this.db.select().from(core_roles);
      const grouped = await this.permissionKeysByRoleId(rows.map((row) => row.id));
      return ok(rows.map((row) => toEntity(row, grouped.get(row.id) ?? [])));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to list roles.", cause));
    }
  }

  async findById(id: string): Promise<Result<Role | null>> {
    try {
      const [row] = await this.db.select().from(core_roles).where(eq(core_roles.id, id)).limit(1);
      if (!row) return ok(null);
      const grouped = await this.permissionKeysByRoleId([row.id]);
      return ok(toEntity(row, grouped.get(row.id) ?? []));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to find role.", cause));
    }
  }

  async findByKey(key: string): Promise<Result<Role | null>> {
    try {
      const [row] = await this.db.select().from(core_roles).where(eq(core_roles.key, key)).limit(1);
      if (!row) return ok(null);
      const grouped = await this.permissionKeysByRoleId([row.id]);
      return ok(toEntity(row, grouped.get(row.id) ?? []));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to find role.", cause));
    }
  }

  async create(input: NewRole): Promise<Result<Role>> {
    try {
      const [row] = await this.db
        .insert(core_roles)
        .values({ key: input.key, name: input.name, description: input.description ?? null })
        .returning();
      if (!row) return err(domainError("INFRA_FAILURE", "Insert returned no row."));
      await this.replacePermissions(row.id, input.permissionKeys ?? []);
      const grouped = await this.permissionKeysByRoleId([row.id]);
      return ok(toEntity(row, grouped.get(row.id) ?? []));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to create role.", cause));
    }
  }

  async update(id: string, patch: RoleUpdate): Promise<Result<Role>> {
    try {
      const [row] = await this.db
        .update(core_roles)
        .set({
          name: patch.name,
          description: patch.description,
          updated_at: new Date(),
        })
        .where(eq(core_roles.id, id))
        .returning();
      if (!row) return err(domainError("NOT_FOUND", "Role not found."));
      if (patch.permissionKeys) await this.replacePermissions(id, patch.permissionKeys);
      const grouped = await this.permissionKeysByRoleId([id]);
      return ok(toEntity(row, grouped.get(id) ?? []));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to update role.", cause));
    }
  }

  async delete(id: string): Promise<Result<true>> {
    try {
      await this.db.delete(core_roles).where(eq(core_roles.id, id));
      return ok(true as const);
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to delete role.", cause));
    }
  }

  async assignToUser(userId: string, roleId: string): Promise<Result<true>> {
    try {
      await this.db
        .insert(core_user_roles)
        .values({ user_id: userId, role_id: roleId })
        .onConflictDoNothing();
      return ok(true as const);
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to assign role.", cause));
    }
  }

  async removeFromUser(userId: string, roleId: string): Promise<Result<true>> {
    try {
      await this.db
        .delete(core_user_roles)
        .where(and(eq(core_user_roles.user_id, userId), eq(core_user_roles.role_id, roleId)));
      return ok(true as const);
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to remove role.", cause));
    }
  }

  async listForUser(userId: string): Promise<Result<Role[]>> {
    try {
      const rows = await this.db
        .select({ role: core_roles })
        .from(core_user_roles)
        .innerJoin(core_roles, eq(core_user_roles.role_id, core_roles.id))
        .where(eq(core_user_roles.user_id, userId));
      const roles = rows.map((row) => row.role);
      const grouped = await this.permissionKeysByRoleId(roles.map((role) => role.id));
      return ok(roles.map((role) => toEntity(role, grouped.get(role.id) ?? [])));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to list user roles.", cause));
    }
  }

  async permissionKeysForUser(userId: string): Promise<Result<string[]>> {
    try {
      const assigned = await this.db
        .select({ roleId: core_user_roles.role_id })
        .from(core_user_roles)
        .where(eq(core_user_roles.user_id, userId));
      const [everyone] = await this.db
        .select({ id: core_roles.id })
        .from(core_roles)
        .where(eq(core_roles.key, EVERYONE_ROLE_KEY))
        .limit(1);
      const roleIds = assigned.map((row) => row.roleId);
      if (everyone) roleIds.push(everyone.id);
      const grouped = await this.permissionKeysByRoleId(roleIds);
      const keys = new Set<string>();
      for (const list of grouped.values()) for (const key of list) keys.add(key);
      return ok([...keys]);
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to resolve user permissions.", cause));
    }
  }
}
