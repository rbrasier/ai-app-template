import {
  ADMIN_ROLE_KEY,
  PERMISSION_CATALOG,
  domainError,
  err,
  type IPermissionRepository,
  type IRoleRepository,
  type NewRole,
  type Permission,
  type Result,
  type Role,
  type RoleUpdate,
} from "@rbrasier/domain";

const CATALOG_KEYS = new Set(PERMISSION_CATALOG.map((permission) => permission.key));

const unknownPermissionKeys = (keys: readonly string[] | undefined): string[] => {
  if (!keys) return [];
  return keys.filter((key) => !CATALOG_KEYS.has(key));
};

export class ListRoles {
  constructor(private readonly roles: IRoleRepository) {}

  execute(): Promise<Result<Role[]>> {
    return this.roles.list();
  }
}

export class CreateRole {
  constructor(private readonly roles: IRoleRepository) {}

  async execute(input: NewRole): Promise<Result<Role>> {
    const unknown = unknownPermissionKeys(input.permissionKeys);
    if (unknown.length > 0) {
      return err(domainError("VALIDATION_FAILED", `Unknown permissions: ${unknown.join(", ")}.`));
    }
    const existing = await this.roles.findByKey(input.key);
    if (existing.error) return existing;
    if (existing.data) {
      return err(domainError("ALREADY_EXISTS", `Role with key ${input.key} exists.`));
    }
    return this.roles.create(input);
  }
}

export class UpdateRole {
  constructor(private readonly roles: IRoleRepository) {}

  async execute(id: string, patch: RoleUpdate): Promise<Result<Role>> {
    const unknown = unknownPermissionKeys(patch.permissionKeys);
    if (unknown.length > 0) {
      return err(domainError("VALIDATION_FAILED", `Unknown permissions: ${unknown.join(", ")}.`));
    }
    const found = await this.roles.findById(id);
    if (found.error) return found;
    if (!found.data) return err(domainError("NOT_FOUND", "Role not found."));
    if (found.data.key === ADMIN_ROLE_KEY) {
      return err(domainError("FORBIDDEN", "The admin role cannot be modified."));
    }
    return this.roles.update(id, patch);
  }
}

export class DeleteRole {
  constructor(private readonly roles: IRoleRepository) {}

  async execute(id: string): Promise<Result<true>> {
    const found = await this.roles.findById(id);
    if (found.error) return found;
    if (!found.data) return err(domainError("NOT_FOUND", "Role not found."));
    if (found.data.isSystem) {
      return err(domainError("FORBIDDEN", "System roles cannot be deleted."));
    }
    return this.roles.delete(id);
  }
}

export class AssignRoleToUser {
  constructor(private readonly roles: IRoleRepository) {}

  execute(userId: string, roleId: string): Promise<Result<true>> {
    return this.roles.assignToUser(userId, roleId);
  }
}

export class RemoveRoleFromUser {
  constructor(private readonly roles: IRoleRepository) {}

  execute(userId: string, roleId: string): Promise<Result<true>> {
    return this.roles.removeFromUser(userId, roleId);
  }
}

export class GetUserPermissions {
  constructor(private readonly roles: IRoleRepository) {}

  execute(userId: string): Promise<Result<string[]>> {
    return this.roles.permissionKeysForUser(userId);
  }
}

export class ListPermissions {
  constructor(private readonly permissions: IPermissionRepository) {}

  execute(): Promise<Result<Permission[]>> {
    return this.permissions.list();
  }
}
