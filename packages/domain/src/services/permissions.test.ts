import { describe, it, expect } from "vitest";
import { PERMISSION_CATALOG, hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("grants any permission to an admin regardless of granted keys", () => {
    expect(hasPermission(true, [], "users.write")).toBe(true);
    expect(hasPermission(true, ["flags.read"], "settings.manage")).toBe(true);
  });

  it("grants a permission a non-admin explicitly holds", () => {
    expect(hasPermission(false, ["flags.manage", "errors.read"], "flags.manage")).toBe(true);
  });

  it("denies a permission a non-admin does not hold", () => {
    expect(hasPermission(false, ["flags.read"], "users.delete")).toBe(false);
  });

  it("denies when a non-admin holds no permissions", () => {
    expect(hasPermission(false, [], "users.read")).toBe(false);
  });
});

describe("PERMISSION_CATALOG", () => {
  it("has unique keys", () => {
    const keys = PERMISSION_CATALOG.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the role management capability", () => {
    expect(PERMISSION_CATALOG.some((permission) => permission.key === "roles.manage")).toBe(true);
  });
});
