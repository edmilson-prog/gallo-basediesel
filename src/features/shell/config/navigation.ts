import type { PermissionAction, RoleName } from "@/shared/types";
import type { ResourceName } from "@/features/rbac/permissions/resources";
import { hasPermission, type IRoleBearer } from "@/features/rbac/utils/hasPermission";
import { ROUTES } from "./routes";

/** Matrix-driven gate for a nav item (operational/feature screens). */
export interface INavPermission {
  resource: ResourceName;
  /** Defaults to "view". */
  action?: PermissionAction;
}

export interface INavItem {
  label: string;
  /** Iconify name. */
  icon: string;
  to: string;
  /**
   * Matrix-driven gate — shown when the user holds the permission. Takes
   * precedence over `roles`, so the Role Editor (and custom roles) drive these
   * items. Used for the operational/feature screens that map to an RBAC resource.
   */
  permission?: INavPermission;
  /**
   * Role allowlist — used for structural items (landing, dashboards, personal,
   * gamification) that have no backing RBAC resource, plus a few financials kept
   * intentionally narrower than the matrix `view` grant (see notes below).
   */
  roles?: RoleName[];
}

export interface INavGroup {
  label: string;
  items: INavItem[];
}

/**
 * Decides whether a nav item is visible to the given user.
 *
 * Hybrid gate (mirrors SettingsLayout): a `permission` item is matrix-driven
 * (so the Role Editor and custom roles govern it, via `roleKey`); otherwise the
 * legacy `roles` allowlist applies. No gate ⇒ hidden (fail-closed).
 */
export function isNavItemVisible(item: INavItem, user: IRoleBearer | null): boolean {
  if (!user) return false;
  if (item.permission) {
    return hasPermission(user, item.permission.resource, item.permission.action ?? "view");
  }
  if (item.roles) return item.roles.includes(user.role);
  return false;
}

/**
 * Full sidebar navigation declaration.
 *
 * Operational/feature items carry a `permission` and are filtered by the RBAC
 * matrix at render time (see `isNavItemVisible` / <Sidebar/>), so the Role
 * Editor and custom roles drive their visibility. Structural items (landing,
 * analytics dashboards, personal, gamification) keep a `roles` allowlist because
 * they have no backing RBAC resource.
 *
 * Kept on `roles` deliberately despite having a resource:
 * - Comissões: Gestor holds `approve` but not `view`, so a `view` gate would
 *   hide it from Gestor (regression).
 * - DRE / Rentabilidade / Estoque: Owner-only by product decision; the matrix
 *   grants `view` to Gestor/Financeiro, which a gate would over-expose.
 */
export const APP_NAV_GROUPS: INavGroup[] = [
  {
    label: "Atendimento",
    items: [
      {
        label: "Início",
        icon: "mdi:home-variant",
        to: ROUTES.APP_INICIO,
        // Renders the Manager Dashboard and is defaultRedirectForRole("Gestor") —
        // omitting Gestor dropped them on a page missing from their own menu.
        roles: ["Owner", "Gestor", "Vendedor"],
      },
      {
        label: "Atendimento",
        icon: "mdi:message-text",
        to: ROUTES.APP_ATENDIMENTO,
        permission: { resource: "conversation" },
      },
      {
        label: "Clientes",
        icon: "mdi:account-multiple",
        to: ROUTES.APP_CLIENTES,
        permission: { resource: "customer" },
      },
      {
        label: "Agenda",
        icon: "mdi:book-account",
        to: ROUTES.APP_AGENDA,
        permission: { resource: "contact" },
      },
      {
        label: "NPS",
        icon: "mdi:emoticon-outline",
        to: ROUTES.APP_NPS,
        // Permission only, no `roles` ceiling: the two combine with AND, and a
        // ceiling here would make granting `nps` in the Role Editor inert.
        permission: { resource: "nps" },
      },
      {
        label: "Leads",
        icon: "mdi:account-question",
        to: ROUTES.APP_LEADS,
        permission: { resource: "lead" },
      },
      {
        label: "Veículos",
        icon: "mdi:truck",
        to: ROUTES.APP_VEICULOS,
        permission: { resource: "vehicle" },
      },
      {
        label: "Carteira",
        icon: "mdi:briefcase-account",
        to: ROUTES.APP_CARTEIRA,
        // Mirrors requireAuth(["Owner", "Gestor"]) on /app/carteira.
        roles: ["Owner", "Gestor"],
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        label: "Catálogo",
        icon: "mdi:cog",
        to: ROUTES.APP_CATALOGO,
        permission: { resource: "part" },
      },
      {
        label: "Kits por modelo",
        icon: "mdi:truck-outline",
        to: ROUTES.APP_KITS,
        permission: { resource: "modelKit" },
      },
      {
        label: "Orçamentos",
        icon: "mdi:file-document-outline",
        to: ROUTES.APP_ORCAMENTOS,
        permission: { resource: "quote" },
      },
      {
        label: "Pedidos",
        icon: "mdi:clipboard-list",
        to: ROUTES.APP_PEDIDOS,
        permission: { resource: "order" },
      },
      {
        label: "Admin da Loja",
        icon: "mdi:storefront",
        to: ROUTES.APP_STOREFRONT_ADMIN,
        permission: { resource: "storefront_admin" },
      },
    ],
  },
  {
    label: "SDR",
    items: [
      {
        label: "Painel SDR",
        icon: "mdi:robot",
        to: ROUTES.APP_SDR,
        // Mirrors requireAuth(["Owner", "Gestor"]) on /app/sdr.
        roles: ["Owner", "Gestor"],
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        label: "Copiloto",
        icon: "mdi:robot-happy-outline",
        to: ROUTES.GESTAO_COPILOTO,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Visão executiva",
        icon: "mdi:view-dashboard",
        to: ROUTES.GESTAO_INICIO,
        roles: ["Owner", "Gestor", "Financeiro"],
      },
      {
        label: "Vendas",
        icon: "mdi:chart-line",
        to: ROUTES.GESTAO_VENDAS,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Forecast",
        icon: "mdi:chart-timeline",
        to: ROUTES.GESTAO_FORECAST,
        roles: ["Owner", "Gestor", "Financeiro"],
      },
      {
        label: "Metas",
        icon: "mdi:target",
        to: ROUTES.GESTAO_METAS,
        permission: { resource: "goal" },
      },
      {
        label: "Indicadores",
        icon: "mdi:chart-line",
        to: ROUTES.GESTAO_INDICADORES,
        permission: { resource: "indicator" },
      },
      {
        label: "Ranking",
        icon: "mdi:trophy",
        to: ROUTES.GESTAO_RANKING,
        // Mirrors requireAuth on /app/gestao/ranking — "Vendedor" removed from
        // both (issue #421): the ranking is scored client-side from store-wide
        // orders/customers, which per-seller RLS truncates to the caller's own
        // rows, so a non-staff viewer always read "#1".
        roles: ["Owner", "Gestor", "Financeiro"],
      },
      {
        label: "Positivação",
        icon: "mdi:account-check",
        to: ROUTES.GESTAO_POSITIVACAO,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Curva ABC",
        icon: "mdi:chart-arc",
        to: ROUTES.GESTAO_ABC,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Carteira Analítica",
        icon: "mdi:heart-pulse",
        to: ROUTES.GESTAO_CARTEIRA_ANALITICA,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Comissões",
        icon: "mdi:cash-multiple",
        to: ROUTES.GESTAO_COMISSOES,
        // Kept on roles: Gestor holds `approve` but not `view` on commission.
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "DRE Gerencial",
        icon: "mdi:file-chart",
        to: ROUTES.GESTAO_DRE,
        // Owner-only by product decision (matrix grants Gestor/Financeiro view).
        roles: ["Owner"],
      },
      {
        label: "Rentabilidade",
        icon: "mdi:scale-balance",
        to: ROUTES.GESTAO_RENTABILIDADE,
        roles: ["Owner"],
      },
      {
        label: "Despesas",
        icon: "mdi:cash-remove",
        to: ROUTES.GESTAO_DESPESAS,
        permission: { resource: "expense" },
      },
      {
        label: "Fluxo de Caixa",
        icon: "mdi:cash-flow",
        to: ROUTES.GESTAO_CAIXA,
        permission: { resource: "cashflow" },
      },
      {
        label: "Estoque",
        icon: "mdi:warehouse",
        to: ROUTES.GESTAO_ESTOQUE,
        // Owner-only by product decision (matrix grants Gestor/Financeiro view).
        roles: ["Owner"],
      },
      {
        label: "Movimentação",
        icon: "mdi:swap-vertical-variant",
        to: ROUTES.GESTAO_ESTOQUE_MOVIMENTACAO,
        permission: { resource: "inventory" },
      },
      {
        label: "Insights",
        icon: "mdi:brain",
        to: ROUTES.APP_INSIGHTS,
        permission: { resource: "insight" },
      },
      {
        label: "Saúde do Sistema",
        icon: "mdi:pulse",
        to: ROUTES.GESTAO_SAUDE,
        permission: { resource: "monitor" },
      },
    ],
  },
  {
    label: "Configurações",
    items: [
      {
        label: "Admin",
        icon: "mdi:cog-outline",
        to: ROUTES.CONFIG_INICIO,
        // /app/configuracoes carries no guard — it redirects to .../perfil and
        // SettingsLayout filters its own sidebar per role. Gating the entry
        // point on Owner hid the 18 settings screens a Gestor already holds.
        roles: ["Owner", "Gestor"],
      },
      {
        label: "Perfil",
        icon: "mdi:account",
        to: ROUTES.CONFIG_PERFIL,
        // Personal settings — every staff role owns one. Mirrors SettingsLayout.
        roles: ["Owner", "Gestor", "Vendedor", "VendedorExterno", "SDR", "Financeiro"],
      },
      {
        label: "Aparência",
        icon: "mdi:palette",
        to: ROUTES.CONFIG_APARENCIA,
        roles: ["Owner", "Gestor", "Vendedor", "VendedorExterno", "SDR", "Financeiro"],
      },
      {
        label: "Tours & Ajuda",
        icon: "mdi:help-circle-outline",
        to: ROUTES.CONFIG_TOURS,
        roles: ["Owner", "Gestor", "Vendedor", "VendedorExterno", "SDR", "Financeiro"],
      },
    ],
  },
];

/**
 * Items shown on the mobile BottomNav, by role.
 *
 * A role absent from this map gets no BottomNav at all — and since <Sidebar/> is
 * `hidden md:flex`, that leaves them with zero navigation on a phone. Every role
 * that can reach /app must therefore have an entry (see `pickItemsForRole`).
 */
export const BOTTOM_NAV: Record<"Owner" | "Gestor" | "Vendedor", INavItem[]> = {
  Owner: [
    {
      label: "Início",
      icon: "mdi:home-variant",
      to: ROUTES.APP_INICIO,
      roles: ["Owner"],
    },
    {
      label: "Atend.",
      icon: "mdi:message-text",
      to: ROUTES.APP_ATENDIMENTO,
      roles: ["Owner"],
    },
    {
      label: "Clientes",
      icon: "mdi:account-multiple",
      to: ROUTES.APP_CLIENTES,
      roles: ["Owner"],
    },
    {
      label: "Gestão",
      icon: "mdi:view-dashboard",
      to: ROUTES.GESTAO_INICIO,
      roles: ["Owner"],
    },
  ],
  Gestor: [
    {
      label: "Início",
      icon: "mdi:home-variant",
      to: ROUTES.APP_INICIO,
      roles: ["Gestor"],
    },
    {
      label: "Atend.",
      icon: "mdi:message-text",
      to: ROUTES.APP_ATENDIMENTO,
      roles: ["Gestor"],
    },
    {
      label: "Clientes",
      icon: "mdi:account-multiple",
      to: ROUTES.APP_CLIENTES,
      roles: ["Gestor"],
    },
    {
      label: "Gestão",
      icon: "mdi:view-dashboard",
      to: ROUTES.GESTAO_INICIO,
      roles: ["Gestor"],
    },
  ],
  Vendedor: [
    {
      label: "Início",
      icon: "mdi:home-variant",
      to: ROUTES.APP_INICIO,
      roles: ["Vendedor"],
    },
    {
      label: "Atend.",
      icon: "mdi:message-text",
      to: ROUTES.APP_ATENDIMENTO,
      roles: ["Vendedor"],
    },
    {
      label: "Clientes",
      icon: "mdi:account-multiple",
      to: ROUTES.APP_CLIENTES,
      roles: ["Vendedor"],
    },
    // "Ranking" removed from the Vendedor bottom nav (issue #421) — the route
    // no longer admits this role, so the entry would only lead to
    // /sem-permissao.
  ],
};
