export type AppRole = "master_admin" | "admin_cliente" | "user" | "admin" | "client" | null;

const ROLE_PRIORITY: Exclude<AppRole, null>[] = [
  "master_admin",
  "admin_cliente",
  "user",
  "admin",
  "client",
];

export function normalizeRole(role: string | null | undefined): AppRole {
  if (!role) return null;
  if (role === "admin") return "master_admin";
  if (role === "client") return "user";
  if (role === "master_admin" || role === "admin_cliente" || role === "user") {
    return role;
  }
  return null;
}

export function resolveHighestRole(
  roles: Array<string | null | undefined> | null | undefined,
): AppRole {
  if (!roles?.length) return null;

  const normalizedRoles = roles
    .map((role) => normalizeRole(role))
    .filter((role): role is Exclude<AppRole, null> => role !== null);

  for (const candidate of ROLE_PRIORITY) {
    const normalizedCandidate = normalizeRole(candidate);
    if (normalizedCandidate && normalizedRoles.includes(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}

export function isMasterAdmin(role: AppRole) {
  return normalizeRole(role) === "master_admin";
}

export function isClientAdmin(role: AppRole) {
  return normalizeRole(role) === "admin_cliente";
}

export function isUserOnly(role: AppRole) {
  return normalizeRole(role) === "user";
}

export function canManageClients(role: AppRole) {
  return isMasterAdmin(role) || isClientAdmin(role);
}

export function getRoleLabel(role: AppRole) {
  switch (normalizeRole(role)) {
    case "master_admin":
      return "Master Admin";
    case "admin_cliente":
      return "Admin Cliente";
    case "user":
      return "User";
    default:
      return "Sem perfil";
  }
}
