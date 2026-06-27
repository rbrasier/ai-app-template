export interface Role {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissionKeys: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewRole {
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly permissionKeys?: readonly string[];
}

export interface RoleUpdate {
  readonly name?: string;
  readonly description?: string | null;
  readonly permissionKeys?: readonly string[];
}

export const EVERYONE_ROLE_KEY = "everyone";
export const ADMIN_ROLE_KEY = "admin";
