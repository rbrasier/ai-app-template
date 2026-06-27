import { describe, it, expect, beforeEach } from "vitest";
import {
  ADMIN_ROLE_KEY,
  EVERYONE_ROLE_KEY,
  domainError,
  err,
  ok,
  type IRoleRepository,
  type NewRole,
  type Permission,
  type Role,
  type RoleUpdate,
} from "@rbrasier/domain";
import {
  AssignRoleToUser,
  CreateRole,
  DeleteRole,
  GetUserPermissions,
  ListPermissions,
  ListRoles,
  RemoveRoleFromUser,
  UpdateRole,
} from "./roles";

class InMemoryRoles implements IRoleRepository {
  private byId = new Map<string, Role>();
  private assignments = new Map<string, Set<string>>();

  seed(role: Role): void {
    this.byId.set(role.id, role);
  }

  async list() {
    return ok([...this.byId.values()]);
  }

  async findById(id: string) {
    return ok(this.byId.get(id) ?? null);
  }

  async findByKey(key: string) {
    return ok([...this.byId.values()].find((role) => role.key === key) ?? null);
  }

  async create(input: NewRole) {
    const now = new Date();
    const role: Role = {
      id: crypto.randomUUID(),
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      permissionKeys: input.permissionKeys ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(role.id, role);
    return ok(role);
  }

  async update(id: string, patch: RoleUpdate) {
    const role = this.byId.get(id);
    if (!role) return err(domainError("NOT_FOUND", "missing"));
    const next: Role = {
      ...role,
      name: patch.name ?? role.name,
      description: patch.description === undefined ? role.description : patch.description,
      permissionKeys: patch.permissionKeys ?? role.permissionKeys,
      updatedAt: new Date(),
    };
    this.byId.set(id, next);
    return ok(next);
  }

  async delete(id: string) {
    this.byId.delete(id);
    return ok(true as const);
  }

  async assignToUser(userId: string, roleId: string) {
    const set = this.assignments.get(userId) ?? new Set<string>();
    set.add(roleId);
    this.assignments.set(userId, set);
    return ok(true as const);
  }

  async removeFromUser(userId: string, roleId: string) {
    this.assignments.get(userId)?.delete(roleId);
    return ok(true as const);
  }

  async listForUser(userId: string) {
    const ids = this.assignments.get(userId) ?? new Set<string>();
    return ok([...ids].map((id) => this.byId.get(id)).filter((role): role is Role => Boolean(role)));
  }

  async permissionKeysForUser(userId: string) {
    const everyone = [...this.byId.values()].find((role) => role.key === EVERYONE_ROLE_KEY);
    const ids = this.assignments.get(userId) ?? new Set<string>();
    const roles = [...ids].map((id) => this.byId.get(id)).filter((role): role is Role => Boolean(role));
    const keys = new Set<string>();
    for (const role of [...(everyone ? [everyone] : []), ...roles]) {
      for (const key of role.permissionKeys) keys.add(key);
    }
    return ok([...keys]);
  }
}

class InMemoryPermissions {
  async list(): Promise<ReturnType<typeof ok<Permission[]>>> {
    const now = new Date();
    return ok([{ id: "1", key: "flags.manage", description: null, createdAt: now, updatedAt: now }]);
  }
}

const makeRole = (over: Partial<Role>): Role => ({
  id: crypto.randomUUID(),
  key: "custom",
  name: "Custom",
  description: null,
  isSystem: false,
  permissionKeys: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("CreateRole", () => {
  let repo: InMemoryRoles;
  beforeEach(() => {
    repo = new InMemoryRoles();
  });

  it("creates a role with valid catalog permissions", async () => {
    const result = await new CreateRole(repo).execute({
      key: "editor",
      name: "Editor",
      permissionKeys: ["flags.manage"],
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.key).toBe("editor");
  });

  it("rejects a duplicate key with ALREADY_EXISTS", async () => {
    repo.seed(makeRole({ key: "editor" }));
    const result = await new CreateRole(repo).execute({ key: "editor", name: "Editor" });
    expect(result.error?.code).toBe("ALREADY_EXISTS");
  });

  it("rejects an unknown permission key with VALIDATION_FAILED", async () => {
    const result = await new CreateRole(repo).execute({
      key: "editor",
      name: "Editor",
      permissionKeys: ["not.a.real.permission"],
    });
    expect(result.error?.code).toBe("VALIDATION_FAILED");
  });
});

describe("UpdateRole", () => {
  let repo: InMemoryRoles;
  beforeEach(() => {
    repo = new InMemoryRoles();
  });

  it("updates a custom role's permissions", async () => {
    const role = makeRole({ key: "editor" });
    repo.seed(role);
    const result = await new UpdateRole(repo).execute(role.id, { permissionKeys: ["flags.manage"] });
    expect(result.data?.permissionKeys).toContain("flags.manage");
  });

  it("refuses to modify the admin role", async () => {
    const admin = makeRole({ key: ADMIN_ROLE_KEY, isSystem: true });
    repo.seed(admin);
    const result = await new UpdateRole(repo).execute(admin.id, { name: "Superuser" });
    expect(result.error?.code).toBe("FORBIDDEN");
  });

  it("allows editing the everyone role", async () => {
    const everyone = makeRole({ key: EVERYONE_ROLE_KEY, isSystem: true });
    repo.seed(everyone);
    const result = await new UpdateRole(repo).execute(everyone.id, { permissionKeys: ["flags.manage"] });
    expect(result.error).toBeUndefined();
  });

  it("returns NOT_FOUND for a missing role", async () => {
    const result = await new UpdateRole(repo).execute(crypto.randomUUID(), { name: "x" });
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("DeleteRole", () => {
  let repo: InMemoryRoles;
  beforeEach(() => {
    repo = new InMemoryRoles();
  });

  it("deletes a custom role", async () => {
    const role = makeRole({ key: "editor" });
    repo.seed(role);
    const result = await new DeleteRole(repo).execute(role.id);
    expect(result.error).toBeUndefined();
  });

  it("refuses to delete a system role", async () => {
    const everyone = makeRole({ key: EVERYONE_ROLE_KEY, isSystem: true });
    repo.seed(everyone);
    const result = await new DeleteRole(repo).execute(everyone.id);
    expect(result.error?.code).toBe("FORBIDDEN");
  });
});

describe("role assignment and permissions", () => {
  it("assigns a role and reflects its permissions for the user", async () => {
    const repo = new InMemoryRoles();
    const editor = makeRole({ key: "editor", permissionKeys: ["flags.manage"] });
    repo.seed(editor);
    await new AssignRoleToUser(repo).execute("user-1", editor.id);
    const result = await new GetUserPermissions(repo).execute("user-1");
    expect(result.data).toContain("flags.manage");
  });

  it("removes a role assignment", async () => {
    const repo = new InMemoryRoles();
    const editor = makeRole({ key: "editor", permissionKeys: ["flags.manage"] });
    repo.seed(editor);
    await new AssignRoleToUser(repo).execute("user-1", editor.id);
    await new RemoveRoleFromUser(repo).execute("user-1", editor.id);
    const result = await new GetUserPermissions(repo).execute("user-1");
    expect(result.data).not.toContain("flags.manage");
  });

  it("lists all roles", async () => {
    const repo = new InMemoryRoles();
    repo.seed(makeRole({ key: "editor" }));
    const result = await new ListRoles(repo).execute();
    expect(result.data?.length).toBe(1);
  });

  it("lists the permission catalog from the repository", async () => {
    const result = await new ListPermissions(new InMemoryPermissions()).execute();
    expect(result.data?.[0]?.key).toBe("flags.manage");
  });
});
