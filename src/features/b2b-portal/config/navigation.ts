import type { PortalUserRole } from "@/shared/types";

export interface IPortalNavItem {
  label: string;
  icon: string;
  to: string;
  /** Permission flag required (besides role) to see the item. */
  requires?: "canViewFinancial";
  /** Roles allowed; omitted = all roles. */
  roles?: PortalUserRole[];
}

/** Sidebar navigation for the B2B portal (PRD-071). */
export const PORTAL_NAV: IPortalNavItem[] = [
  { label: "Início", icon: "mdi:view-dashboard-outline", to: "/portal/inicio" },
  { label: "Frota", icon: "mdi:truck-outline", to: "/portal/frota" },
  { label: "Solicitações", icon: "mdi:clipboard-text-outline", to: "/portal/solicitacoes" },
  { label: "Pedidos", icon: "mdi:package-variant-closed", to: "/portal/pedidos" },
  {
    label: "Faturamento",
    icon: "mdi:file-document-outline",
    to: "/portal/faturamento",
    requires: "canViewFinancial",
  },
  { label: "Análise", icon: "mdi:chart-box-outline", to: "/portal/analise" },
  {
    label: "Usuários",
    icon: "mdi:account-group-outline",
    to: "/portal/usuarios",
    roles: ["admin"],
  },
  { label: "Perfil", icon: "mdi:office-building-outline", to: "/portal/perfil" },
  { label: "Suporte", icon: "mdi:lifebuoy", to: "/portal/suporte" },
];
