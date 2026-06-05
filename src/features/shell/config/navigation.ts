import type { RoleName } from "@/shared/types";
import { ROUTES } from "./routes";

export interface INavItem {
  label: string;
  /** Iconify name. */
  icon: string;
  to: string;
  /** Roles allowed to see this item. */
  roles: RoleName[];
}

export interface INavGroup {
  label: string;
  items: INavItem[];
}

/**
 * Full sidebar navigation declaration.
 * Filtered at render time by the current user role (see <Sidebar/>).
 */
export const APP_NAV_GROUPS: INavGroup[] = [
  {
    label: "Atendimento",
    items: [
      {
        label: "Início",
        icon: "mdi:home-variant",
        to: ROUTES.APP_INICIO,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Atendimento",
        icon: "mdi:message-text",
        to: ROUTES.APP_ATENDIMENTO,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Clientes",
        icon: "mdi:account-multiple",
        to: ROUTES.APP_CLIENTES,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Leads",
        icon: "mdi:account-question",
        to: ROUTES.APP_LEADS,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Veículos",
        icon: "mdi:truck",
        to: ROUTES.APP_VEICULOS,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Carteira",
        icon: "mdi:briefcase-account",
        to: ROUTES.APP_CARTEIRA,
        roles: ["Owner"],
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
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Kits por modelo",
        icon: "mdi:truck-outline",
        to: ROUTES.APP_KITS,
        roles: ["Owner", "Gestor", "Vendedor"],
      },
      {
        label: "Orçamentos",
        icon: "mdi:file-document-outline",
        to: ROUTES.APP_ORCAMENTOS,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Pedidos",
        icon: "mdi:clipboard-list",
        to: ROUTES.APP_PEDIDOS,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Admin da Loja",
        icon: "mdi:storefront",
        to: ROUTES.APP_STOREFRONT_ADMIN,
        roles: ["Owner", "Gestor"],
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
        roles: ["Owner"],
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
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Indicadores",
        icon: "mdi:chart-line",
        to: ROUTES.GESTAO_INDICADORES,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "Ranking",
        icon: "mdi:trophy",
        to: ROUTES.GESTAO_RANKING,
        roles: ["Owner", "Vendedor"],
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
        roles: ["Owner"],
      },
      {
        label: "DRE Gerencial",
        icon: "mdi:file-chart",
        to: ROUTES.GESTAO_DRE,
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
        roles: ["Owner", "Financeiro", "Gestor"],
      },
      {
        label: "Fluxo de Caixa",
        icon: "mdi:cash-flow",
        to: ROUTES.GESTAO_CAIXA,
        roles: ["Owner", "Financeiro", "Gestor"],
      },
      {
        label: "Estoque",
        icon: "mdi:warehouse",
        to: ROUTES.GESTAO_ESTOQUE,
        roles: ["Owner"],
      },
      {
        label: "Movimentação",
        icon: "mdi:swap-vertical-variant",
        to: ROUTES.GESTAO_ESTOQUE_MOVIMENTACAO,
        roles: ["Owner", "Gestor", "Financeiro"],
      },
      {
        label: "Insights",
        icon: "mdi:brain",
        to: ROUTES.APP_INSIGHTS,
        roles: ["Owner", "Gestor", "Financeiro"],
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
        roles: ["Owner"],
      },
      {
        label: "Perfil",
        icon: "mdi:account",
        to: ROUTES.CONFIG_PERFIL,
        roles: ["Owner", "Vendedor"],
      },
      {
        label: "Aparência",
        icon: "mdi:palette",
        to: ROUTES.CONFIG_APARENCIA,
        roles: ["Owner", "Vendedor"],
      },
    ],
  },
];

/** Items shown on the mobile BottomNav, by role. */
export const BOTTOM_NAV: Record<"Owner" | "Vendedor", INavItem[]> = {
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
    {
      label: "Ranking",
      icon: "mdi:trophy",
      to: ROUTES.GESTAO_RANKING,
      roles: ["Vendedor"],
    },
  ],
};
