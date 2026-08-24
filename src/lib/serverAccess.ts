import type { AppRole } from "@/lib/roles";

export type AuthorizationStatus = 200 | 401 | 403;

export function getAuthorizationStatus(
  authenticated: boolean,
  role: AppRole,
  allowedRoles: ReadonlyArray<Exclude<AppRole, null>>,
): AuthorizationStatus {
  if (!authenticated) return 401;
  if (!role || !allowedRoles.includes(role)) return 403;
  return 200;
}
