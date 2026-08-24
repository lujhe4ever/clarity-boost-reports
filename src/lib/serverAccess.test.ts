import { describe, expect, it } from "vitest";

import { getAuthorizationStatus } from "@/lib/serverAccess";

describe("server administrative authorization", () => {
  it("returns 401 for unauthenticated administrative requests", () => {
    expect(getAuthorizationStatus(false, null, ["master_admin"])).toBe(401);
    expect(getAuthorizationStatus(false, null, ["master_admin", "admin_cliente"])).toBe(401);
  });

  it("returns 403 when a regular user calls an administrative operation", () => {
    expect(getAuthorizationStatus(true, "user", ["master_admin"])).toBe(403);
    expect(getAuthorizationStatus(true, "user", ["master_admin", "admin_cliente"])).toBe(403);
  });

  it("preserves the intended administrator permissions", () => {
    expect(getAuthorizationStatus(true, "master_admin", ["master_admin"])).toBe(200);
    expect(getAuthorizationStatus(true, "admin_cliente", ["master_admin", "admin_cliente"])).toBe(
      200,
    );
    expect(getAuthorizationStatus(true, "admin_cliente", ["master_admin"])).toBe(403);
  });
});
