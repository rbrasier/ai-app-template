import type { NewRole, Role, RoleUpdate } from "../entities/role";
import type { Result } from "../result";

export interface IRoleRepository {
  list(): Promise<Result<Role[]>>;
  findById(id: string): Promise<Result<Role | null>>;
  findByKey(key: string): Promise<Result<Role | null>>;
  create(role: NewRole): Promise<Result<Role>>;
  update(id: string, patch: RoleUpdate): Promise<Result<Role>>;
  delete(id: string): Promise<Result<true>>;
  assignToUser(userId: string, roleId: string): Promise<Result<true>>;
  removeFromUser(userId: string, roleId: string): Promise<Result<true>>;
  listForUser(userId: string): Promise<Result<Role[]>>;
  permissionKeysForUser(userId: string): Promise<Result<string[]>>;
}
