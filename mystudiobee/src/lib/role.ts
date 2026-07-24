export type Role = "super_admin" | "admin" | "manager" | "employee";

export function isAdminTier(role: Role) {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: Role) {
  return role === "super_admin";
}

export function canSeeCost(role: Role) {
  return isAdminTier(role);
}

export function isBillingRole(role: Role) {
  return isAdminTier(role) || role === "manager";
}
