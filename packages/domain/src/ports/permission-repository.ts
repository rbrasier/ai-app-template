import type { Permission } from "../entities/permission";
import type { Result } from "../result";

export interface IPermissionRepository {
  list(): Promise<Result<Permission[]>>;
}
