import type { IPermission, IRbacResource, IRole, RoleName } from "@/shared/types";
import { PERMISSIONS_MATRIX, ROLE_DESCRIPTIONS } from "./matrix";
import { RESOURCES, type ResourceName } from "./resources";

/**
 * RBAC seed builder (PRD-211 RF-003).
 *
 * Converts the hardcoded `PERMISSIONS_MATRIX` and `RESOURCES` catalog into
 * persistable rows. The empty-diff parity test (`seed.test.ts`) guarantees the
 * seed reproduces the frontend matrix exactly, so the migration to data-driven
 * roles never silently drifts from the source of truth.
 *
 * Labels are intentionally copied verbatim from the read-only RolesPage so the
 * persisted catalog matches what the matrix screen already shows.
 */

/** A role row ready to persist — id/timestamps are assigned by the data layer. */
export type RoleSeed = Omit<IRole, "id" | "createdAt" | "updatedAt">;

/**
 * Human labels for the 7 system roles.
 * Copied verbatim from `ROLE_LABELS` in `../pages/RolesPage.tsx`.
 */
const ROLE_LABELS: Record<RoleName, string> = {
  Owner: "Owner",
  Gestor: "Gestor",
  Vendedor: "Vendedor",
  VendedorExterno: "Vendedor Externo",
  SDR: "SDR",
  Financeiro: "Financeiro",
  Cliente: "Cliente",
};

/**
 * Human labels per resource.
 * The first block is copied verbatim from `RESOURCE_LABELS` in
 * `../pages/RolesPage.tsx`; the Quick Send / Asset Library block (PRD-027) is
 * authored here because those resources are not rendered on the legacy screen.
 */
const RESOURCE_LABELS: Record<ResourceName, string> = {
  customer: "Clientes",
  // `contact` is a matrix resource absent from the legacy RolesPage table.
  contact: "Contatos",
  vehicle: "Veículos",
  lead: "Leads",
  funnel: "Funis",
  conversation: "Conversas",
  message: "Mensagens",
  part: "Catálogo",
  vehicleModel: "Modelos de veículo",
  modelKit: "Kits por modelo",
  quote: "Orçamentos",
  order: "Pedidos",
  commission: "Comissões",
  goal: "Metas",
  indicator: "Indicadores",
  recommendation: "Recomendações",
  transfer: "Transferências",
  segment: "Segmentos",
  seller: "Vendedores",
  store: "Lojas",
  settings: "Configurações",
  audit_log: "Auditoria",
  // `media` is a matrix resource absent from the legacy RolesPage table.
  media: "Mídia",
  role: "Papéis",
  dre: "DRE Gerencial",
  expense: "Despesas",
  cashflow: "Fluxo de Caixa",
  profitability: "Rentabilidade",
  inventory: "Estoque",
  customer_service_analytics: "Análise de Atendimento",
  service_volume: "Volume de Atendimento",
  insight: "Insights",
  storefront_admin: "Admin E-commerce",
  ecommerce_integration: "Integração E-commerce",
  // Quick Send & Asset Library (PRD-027) — not present on the legacy RolesPage.
  asset_library: "Biblioteca de Ativos",
  quick_reply: "Respostas Rápidas",
  trackable_link: "Links Rastreáveis",
  scheduled_send: "Envios Agendados",
  // Role administration & monitoring (PRD-211 Task 16).
  manage_roles: "Gerir papéis",
  monitor: "Monitoramento",
  // Settings areas lifted out of hardcoded role allowlists — keep these labels
  // in sync with 20260809130238_rbac_settings_resources.sql.
  settings_users: "Usuários",
  settings_whatsapp: "WhatsApp & Templates",
  settings_api_keys: "Chaves & API",
  settings_ai: "Inteligência artificial",
  settings_sdr: "Agente SDR",
  settings_automation: "Automações de atendimento",
  settings_system: "Sistema & Sessão",
};

/** Editorial grouping of resources into UI areas (PRD-211). */
const RESOURCE_GROUPS: Record<ResourceName, string> = {
  // Comercial
  customer: "Comercial",
  contact: "Comercial",
  vehicle: "Comercial",
  lead: "Comercial",
  funnel: "Comercial",
  quote: "Comercial",
  order: "Comercial",
  commission: "Comercial",
  segment: "Comercial",
  transfer: "Comercial",
  goal: "Comercial",
  indicator: "Comercial",
  recommendation: "Comercial",
  // Atendimento
  conversation: "Atendimento",
  message: "Atendimento",
  media: "Atendimento",
  customer_service_analytics: "Atendimento",
  service_volume: "Atendimento",
  asset_library: "Atendimento",
  quick_reply: "Atendimento",
  trackable_link: "Atendimento",
  scheduled_send: "Atendimento",
  // Catálogo
  part: "Catálogo",
  vehicleModel: "Catálogo",
  modelKit: "Catálogo",
  // Financeiro
  dre: "Financeiro",
  expense: "Financeiro",
  cashflow: "Financeiro",
  profitability: "Financeiro",
  inventory: "Financeiro",
  // E-commerce
  storefront_admin: "E-commerce",
  ecommerce_integration: "E-commerce",
  // Gestão
  seller: "Gestão",
  store: "Gestão",
  insight: "Gestão",
  audit_log: "Gestão",
  // Configuração
  settings: "Configuração",
  role: "Configuração",
  manage_roles: "Configuração",
  monitor: "Configuração",
  settings_users: "Configuração",
  settings_whatsapp: "Configuração",
  settings_api_keys: "Configuração",
  settings_ai: "Configuração",
  settings_sdr: "Configuração",
  settings_automation: "Configuração",
  settings_system: "Configuração",
};

/**
 * Build the role seed rows from the hardcoded matrix.
 * Parity with `PERMISSIONS_MATRIX` is enforced by `seed.test.ts`.
 */
export function buildRoleSeed(): RoleSeed[] {
  return (Object.keys(PERMISSIONS_MATRIX) as RoleName[]).map((role) => {
    const permissions: IPermission[] = PERMISSIONS_MATRIX[role].map((p) => ({
      resource: p.resource,
      actions: [...p.actions],
      scope: p.scope,
    }));
    return {
      slug: role,
      name: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
      isSystem: true,
      isOwnerImmutable: role === "Owner",
      baseRole: role,
      storeId: null,
      permissions,
    };
  });
}

/**
 * Build the resource catalog seed covering every entry in `RESOURCES`.
 * Ordered by group, then by label, with a sequential `sortOrder`.
 */
export function buildResourceSeed(): IRbacResource[] {
  // Deterministic group ordering for a coherent UI grouping.
  const GROUP_ORDER = [
    "Comercial",
    "Atendimento",
    "Catálogo",
    "Financeiro",
    "E-commerce",
    "Gestão",
    "Configuração",
  ];

  const entries = RESOURCES.map((key) => ({
    key,
    label: RESOURCE_LABELS[key],
    group: RESOURCE_GROUPS[key],
  }));

  entries.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.label.localeCompare(b.label, "pt-BR");
  });

  return entries.map((e, index) => ({
    key: e.key,
    label: e.label,
    group: e.group,
    sortOrder: index,
  }));
}
