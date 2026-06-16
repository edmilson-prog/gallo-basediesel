import type { IPermission, PermissionAction, RoleName } from "@/shared/types";
import type { ResourceName } from "./resources";

/**
 * RBAC permission matrix — the single source of truth for the frontend.
 *
 * Layout: `Record<RoleName, IPermission[]>` where each permission is
 * `{ resource, actions, scope }`. Adding/removing permissions happens here
 * and nowhere else; helpers and components read from `PERMISSIONS_MATRIX`
 * and the derived `EFFECTIVE_PERMISSIONS_INDEX` on every check.
 *
 * NOTE: this is **UX/UI discipline only** — real protection lives in the
 * Supabase RLS layer (Fase 2), which must mirror every entry below.
 *
 * @see docs/rbac.md for the human-readable matrix and the Supabase mapping.
 */

type ScopedActions = {
  resource: ResourceName;
  actions: readonly PermissionAction[];
  scope: IPermission["scope"];
};

const CRUD = ["view", "create", "edit", "delete"] as const satisfies readonly PermissionAction[];
const CRUDA = [...CRUD, "approve"] as const satisfies readonly PermissionAction[];

function p(
  resource: ResourceName,
  actions: readonly PermissionAction[],
  scope: IPermission["scope"],
): ScopedActions {
  return { resource, actions, scope };
}

const OWNER_ENTRIES: ScopedActions[] = [
  p("customer", CRUD, "all"),
  p("vehicle", CRUD, "all"),
  p("lead", CRUD, "all"),
  p("conversation", CRUD, "all"),
  p("message", CRUD, "all"),
  p("part", CRUD, "all"),
  p("vehicleModel", CRUD, "all"),
  p("modelKit", CRUD, "all"),
  p("quote", CRUDA, "all"),
  p("order", CRUD, "all"),
  p("commission", CRUDA, "all"),
  p("goal", CRUD, "all"),
  p("indicator", CRUD, "all"),
  p("recommendation", CRUD, "all"),
  p("transfer", CRUD, "all"),
  p("segment", CRUD, "all"),
  p("seller", CRUD, "all"),
  p("store", CRUD, "all"),
  p("settings", CRUD, "all"),
  // Audit log: view-only across all stores. Append-only by design — Owner does
  // not get `delete` so the UI never offers it (Fase 2 enforces append-only at
  // the DB level via revoke + trigger).
  p("audit_log", ["view"], "all"),
  p("media", CRUD, "all"),
  p("role", CRUD, "all"),
  p("dre", ["view", "edit"], "all"),
  p("expense", CRUD, "all"),
  p("cashflow", ["view", "create"], "all"),
  p("profitability", ["view"], "all"),
  p("inventory", ["view", "edit"], "all"),
  p("customer_service_analytics", ["view"], "all"),
  p("insight", ["view", "edit", "delete"], "all"),
  p("storefront_admin", ["view", "edit"], "all"),
  p("ecommerce_integration", ["view", "edit"], "all"),
  // Quick Send & Asset Library (PRD-027 D-12)
  p("asset_library", CRUD, "all"),
  p("quick_reply", CRUD, "all"),
  p("trackable_link", CRUD, "all"),
  p("scheduled_send", CRUD, "all"),
];

const GESTOR_ENTRIES: ScopedActions[] = [
  p("customer", CRUD, "store"),
  p("vehicle", CRUD, "store"),
  p("lead", CRUD, "store"),
  p("conversation", CRUD, "store"),
  p("message", ["create"], "store"),
  p("part", ["view", "create", "edit"], "store"),
  p("vehicleModel", CRUD, "store"),
  p("modelKit", CRUD, "store"),
  p("quote", CRUDA, "store"),
  p("order", CRUD, "store"),
  p("commission", ["approve"], "store"),
  p("goal", CRUD, "store"),
  p("indicator", CRUD, "store"),
  p("recommendation", ["view"], "store"),
  p("transfer", CRUD, "store"),
  p("segment", CRUD, "store"),
  p("seller", ["view"], "store"),
  p("store", ["view"], "own"),
  p("settings", ["view"], "store"),
  p("audit_log", ["view"], "store"),
  p("media", ["view", "edit", "delete"], "store"),
  p("role", ["view"], "store"),
  p("dre", ["view"], "store"),
  // Gestor: read-only on financials (PRD-054 / PRD-055).
  p("expense", ["view"], "store"),
  p("cashflow", ["view"], "store"),
  p("profitability", ["view"], "store"),
  p("inventory", ["view"], "store"),
  p("customer_service_analytics", ["view"], "store"),
  p("insight", ["view", "edit"], "store"),
  // Gestor: read-only on the storefront admin dashboard/analysis (PRD-066 RF-023).
  p("storefront_admin", ["view"], "store"),
  // Quick Send & Asset Library (PRD-027 D-12) — manage at store scope.
  p("asset_library", CRUD, "store"),
  p("quick_reply", CRUD, "store"),
  p("trackable_link", CRUD, "store"),
  p("scheduled_send", CRUD, "store"),
];

const VENDEDOR_ENTRIES: ScopedActions[] = [
  p("customer", ["view", "edit"], "own"),
  p("vehicle", ["view", "edit"], "own"),
  p("lead", ["view", "edit"], "own"),
  p("conversation", ["view", "edit"], "own"),
  p("message", ["view", "create"], "own"),
  p("media", ["view"], "own"),
  p("part", ["view"], "store"),
  p("vehicleModel", ["view"], "store"),
  p("modelKit", ["view", "create"], "store"),
  p("quote", ["view", "edit"], "own"),
  p("order", ["view"], "own"),
  p("commission", ["view"], "own"),
  p("goal", ["view"], "own"),
  p("indicator", ["view"], "own"),
  p("recommendation", ["view"], "own"),
  p("segment", ["view", "create", "edit"], "own"),
  p("seller", ["view"], "own"),
  p("settings", ["view"], "own"),
  // Quick Send & Asset Library (PRD-027 D-12) — read library, create own links/sends.
  p("asset_library", ["view"], "own"),
  p("quick_reply", ["view"], "own"),
  p("trackable_link", ["create"], "own"),
  p("scheduled_send", ["create"], "own"),
];

const SDR_ENTRIES: ScopedActions[] = [
  p("customer", ["view"], "store"),
  p("vehicle", ["view"], "store"),
  p("lead", ["view", "create"], "own"),
  p("conversation", ["view", "create"], "own"),
  p("message", ["view", "create"], "own"),
  p("media", ["view"], "own"),
  p("part", ["view"], "store"),
  p("quote", ["view", "create"], "own"),
  p("recommendation", ["view"], "own"),
  p("seller", ["view"], "store"),
  // Quick Send & Asset Library (PRD-027 D-12) — same as Vendedor.
  p("asset_library", ["view"], "own"),
  p("quick_reply", ["view"], "own"),
  p("trackable_link", ["create"], "own"),
  p("scheduled_send", ["create"], "own"),
];

const CLIENTE_ENTRIES: ScopedActions[] = [
  p("vehicle", ["view"], "own"),
  p("conversation", ["view", "create"], "own"),
  p("message", ["view", "create"], "own"),
  p("part", ["view"], "store"),
  p("quote", ["view"], "own"),
  p("order", ["view"], "own"),
];

const VENDEDOR_EXTERNO_ENTRIES: ScopedActions[] = [
  p("customer", ["view", "edit"], "own"),
  p("vehicle", ["view", "edit"], "own"),
  p("lead", ["view", "edit"], "own"),
  p("conversation", ["view", "edit"], "own"),
  p("message", ["view", "create"], "own"),
  p("media", ["view"], "own"),
  p("part", ["view"], "store"),
  p("quote", ["view", "edit"], "own"),
  p("order", ["view"], "own"),
  p("commission", ["view"], "own"),
  p("goal", ["view"], "own"),
  p("indicator", ["view"], "own"),
  p("recommendation", ["view"], "own"),
  p("segment", ["view", "edit"], "own"),
  p("seller", ["view"], "own"),
];

const FINANCEIRO_ENTRIES: ScopedActions[] = [
  p("customer", ["view"], "store"),
  p("quote", ["view"], "store"),
  p("order", ["view"], "store"),
  p("commission", ["view", "approve"], "store"),
  p("goal", ["view"], "store"),
  p("indicator", ["view"], "store"),
  p("seller", ["view"], "store"),
  p("store", ["view"], "own"),
  p("part", ["view"], "store"),
  p("audit_log", ["view"], "store"),
  p("dre", ["view", "edit"], "store"),
  // Financeiro: full expense CRUD + cash flow management (PRD-054 / PRD-055).
  p("expense", CRUD, "store"),
  p("cashflow", ["view", "create"], "store"),
  p("profitability", ["view"], "store"),
  p("inventory", ["view"], "store"),
  p("customer_service_analytics", ["view"], "store"),
  p("insight", ["view"], "store"),
];

function toPermissions(entries: ScopedActions[]): IPermission[] {
  return entries.map((e) => ({
    resource: e.resource,
    actions: [...e.actions],
    scope: e.scope,
  }));
}

export const PERMISSIONS_MATRIX: Record<RoleName, IPermission[]> = {
  Owner: toPermissions(OWNER_ENTRIES),
  Gestor: toPermissions(GESTOR_ENTRIES),
  Vendedor: toPermissions(VENDEDOR_ENTRIES),
  SDR: toPermissions(SDR_ENTRIES),
  Cliente: toPermissions(CLIENTE_ENTRIES),
  VendedorExterno: toPermissions(VENDEDOR_EXTERNO_ENTRIES),
  Financeiro: toPermissions(FINANCEIRO_ENTRIES),
};

/**
 * Pre-computed lookup index: `role → resource → { actions, scope }`.
 *
 * Built once at import time so `hasPermission()` is O(1) on every call.
 */
export type ResourceIndex = Partial<
  Record<ResourceName, { actions: ReadonlySet<PermissionAction>; scope: IPermission["scope"] }>
>;

export const EFFECTIVE_PERMISSIONS_INDEX: Record<RoleName, ResourceIndex> = (() => {
  const out = {} as Record<RoleName, ResourceIndex>;
  (Object.keys(PERMISSIONS_MATRIX) as RoleName[]).forEach((role) => {
    const index: ResourceIndex = {};
    PERMISSIONS_MATRIX[role].forEach((perm) => {
      index[perm.resource as ResourceName] = {
        actions: new Set(perm.actions),
        scope: perm.scope,
      };
    });
    out[role] = index;
  });
  return out;
})();

/** Lightweight metadata for the read-only RolesPage. */
export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  Owner: "Fundador da loja — visão e poder total em todos os dados e configurações.",
  Gestor: "Gerencia operação de uma loja (filial ou matriz), aprova comissões e orçamentos.",
  Vendedor: "Atende clientes da própria carteira, cria orçamentos e acompanha pedidos.",
  SDR: "Qualifica leads e prepara conversas; cria orçamentos como agente, sem acesso financeiro.",
  Cliente: "Usuário B2B/B2C do portal — vê o próprio histórico e abre atendimento.",
  VendedorExterno: "Vendedor de campo com região atribuída — equivalente ao Vendedor no MVP.",
  Financeiro: "Acompanha pedidos da loja, aprova comissões e visualiza auditoria.",
};
