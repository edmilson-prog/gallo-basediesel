import type { RoleName } from "@/shared/types";

/**
 * Maps the database / JWT role (PRD-107 `app_metadata.role`) to the frontend
 * `RoleName` used by the RBAC matrix (PRD-006). The two vocabularies differ:
 * the backend uses `owner/manager/seller_internal/...`, the frontend uses
 * `Owner/Gestor/Vendedor/...`.
 */
const DB_ROLE_TO_ROLE_NAME: Record<string, RoleName> = {
  owner: "Owner",
  manager: "Gestor",
  seller_internal: "Vendedor",
  seller_external: "VendedorExterno",
  sdr: "SDR",
  financeiro: "Financeiro",
  b2b_customer: "Cliente",
  b2c_customer: "Cliente",
};

/** Falls back to the least-privileged role when the DB role is unknown/absent. */
export function mapDbRoleToRoleName(dbRole: string | null | undefined): RoleName {
  if (!dbRole) return "Cliente";
  return DB_ROLE_TO_ROLE_NAME[dbRole] ?? "Cliente";
}

/** Login-screen visual grouping derived from the role. */
export function roleGroup(role: RoleName): "team" | "client" | "admin" {
  return role === "Cliente" ? "client" : "team";
}

/** Where to send the user right after sign-in, by role. */
export function defaultRedirectForRole(role: RoleName): string {
  switch (role) {
    case "Owner":
    case "Gestor":
    case "Financeiro":
      return "/app/inicio";
    case "Vendedor":
    case "VendedorExterno":
    case "SDR":
      return "/app/atendimento";
    case "Cliente":
      return "/loja";
    default:
      return "/app/inicio";
  }
}
