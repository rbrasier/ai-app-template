import {
  domainError,
  err,
  ok,
  type IPermissionRepository,
  type Permission,
  type Result,
} from "@rbrasier/domain";
import type { Database } from "../db/client";
import { core_permissions } from "../db/schema/core";

const toEntity = (row: typeof core_permissions.$inferSelect): Permission => ({
  id: row.id,
  key: row.key,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DrizzlePermissionRepository implements IPermissionRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<Result<Permission[]>> {
    try {
      const rows = await this.db.select().from(core_permissions);
      return ok(rows.map(toEntity));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to list permissions.", cause));
    }
  }
}
