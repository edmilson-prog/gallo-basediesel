import { Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PermissionAction, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActiveDataSource } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import type { ResourceName } from "@/features/rbac/permissions/resources";

interface ISettingsItem {
  label: string;
  icon: string;
  to: string;
  permission?: { resource: ResourceName; action: PermissionAction };
  roles?: RoleName[];
  /** Marker used to display a small "Em breve" pill in the sidebar. */
  upcoming?: boolean;
  /** Only shown in Demonstração (mock) data source — mock-first areas not yet wired to Supabase. */
  demoOnly?: boolean;
}

interface ISettingsGroup {
  label: string;
  items: ISettingsItem[];
}

const SETTINGS_GROUPS: ISettingsGroup[] = [
  {
    label: "Pessoal",
    items: [
      {
        label: "Perfil",
        icon: "mdi:account-circle-outline",
        to: "/app/configuracoes/perfil",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"],
      },
      {
        label: "Aparência",
        icon: "mdi:palette-outline",
        to: "/app/configuracoes/aparencia",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"],
      },
      {
        label: "Notificações",
        icon: "mdi:bell-outline",
        to: "/app/configuracoes/notificacoes",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"],
      },
      {
        label: "Copiloto",
        icon: "mdi:lightbulb-on-outline",
        to: "/app/configuracoes/copiloto",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno"],
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        label: "Usuários",
        icon: "mdi:account-group-outline",
        to: "/app/configuracoes/usuarios",
        roles: ["Owner"],
      },
      {
        label: "Departamentos",
        icon: "mdi:account-group-outline",
        to: "/app/configuracoes/departamentos",
        permission: { resource: "seller", action: "edit" },
      },
      {
        label: "Papéis",
        icon: "mdi:shield-account-outline",
        to: "/app/configuracoes/papeis",
        permission: { resource: "role", action: "view" },
      },
      {
        label: "Lojas",
        icon: "mdi:store-outline",
        to: "/app/configuracoes/lojas",
        permission: { resource: "store", action: "view" },
      },
    ],
  },
  {
    label: "Operação",
    items: [
      {
        label: "Distribuição",
        icon: "mdi:call-split",
        to: "/app/configuracoes/distribuicao",
        permission: { resource: "settings", action: "edit" },
      },
      {
        label: "Templates WhatsApp",
        icon: "mdi:message-text-clock-outline",
        to: "/app/configuracoes/templates-whatsapp",
        roles: ["Owner", "Gestor"],
      },
      {
        label: "Pipeline de leads",
        icon: "mdi:view-column-outline",
        to: "/app/configuracoes/atendimento/pipeline",
        permission: { resource: "settings", action: "view" },
      },
      {
        label: "Motivos de perda",
        icon: "mdi:close-circle-outline",
        to: "/app/configuracoes/atendimento/motivos-perda",
        permission: { resource: "settings", action: "view" },
      },
      {
        label: "Tags do catálogo",
        icon: "mdi:tag-multiple-outline",
        to: "/app/configuracoes/atendimento/tags",
        permission: { resource: "settings", action: "view" },
      },
      {
        label: "Ciclo de vida",
        icon: "mdi:account-clock-outline",
        to: "/app/configuracoes/atendimento/lifecycle",
        permission: { resource: "settings", action: "edit" },
      },
      {
        label: "Horário comercial",
        icon: "mdi:calendar-clock-outline",
        to: "/app/configuracoes/atendimento/horario-comercial",
        permission: { resource: "settings", action: "edit" },
      },
      {
        label: "Cadastro de veículos",
        icon: "mdi:truck-outline",
        to: "/app/configuracoes/veiculos/cadastro-mode",
        permission: { resource: "settings", action: "edit" },
      },
      {
        label: "Frete",
        icon: "mdi:truck-fast-outline",
        to: "/app/configuracoes/frete",
        permission: { resource: "settings", action: "view" },
      },
    ],
  },
  {
    label: "Agente SDR",
    items: [
      {
        label: "Simulador",
        icon: "mdi:robot-happy-outline",
        to: "/app/configuracoes/sdr/simulador",
        roles: ["Owner", "Gestor"],
      },
      {
        label: "Templates de mensagem",
        icon: "mdi:message-text-outline",
        to: "/app/configuracoes/sdr/templates",
        roles: ["Owner"],
      },
      {
        label: "Orçamento automático",
        icon: "mdi:file-document-edit-outline",
        to: "/app/configuracoes/sdr/orcamento",
        roles: ["Owner"],
      },
    ],
  },
  {
    label: "Integrações",
    items: [
      {
        label: "Inteligência artificial",
        icon: "mdi:robot-happy-outline",
        to: "/app/configuracoes/ia",
        roles: ["Owner"],
      },
      {
        label: "WhatsApp",
        icon: "mdi:whatsapp",
        to: "/app/configuracoes/whatsapp",
        roles: ["Owner"],
      },
      {
        label: "Chaves & API",
        icon: "mdi:key-variant",
        to: "/app/configuracoes/chaves",
        roles: ["Owner"],
      },
      {
        label: "Portal do cliente",
        icon: "mdi:web",
        to: "/app/configuracoes/portal-cliente",
        roles: ["Owner"],
        upcoming: true,
      },
    ],
  },
  {
    label: "Avançado",
    items: [
      {
        label: "Gamificação",
        icon: "mdi:trophy-outline",
        to: "/app/configuracoes/gamificacao",
        roles: ["Owner"],
        upcoming: true,
      },
      {
        label: "Comissões",
        icon: "mdi:cash-multiple",
        to: "/app/configuracoes/comissoes",
        roles: ["Owner"],
      },
      {
        label: "Financeiro / DRE",
        icon: "mdi:file-chart-outline",
        to: "/app/configuracoes/financeiro",
        roles: ["Owner", "Financeiro"],
      },
      {
        label: "Estoque (análise)",
        icon: "mdi:warehouse",
        to: "/app/configuracoes/estoque-analise",
        roles: ["Owner"],
      },
      {
        label: "Insights",
        icon: "mdi:brain",
        to: "/app/configuracoes/insights",
        roles: ["Owner"],
      },
      {
        label: "Forecast",
        icon: "mdi:chart-bell-curve-cumulative",
        to: "/app/configuracoes/forecast",
        roles: ["Owner"],
      },
      {
        label: "Vitrine pública",
        icon: "mdi:storefront-outline",
        to: "/app/storefront-admin",
        roles: ["Owner"],
      },
      {
        label: "Integração E-commerce",
        icon: "mdi:cart-arrow-down",
        to: "/app/configuracoes/ecommerce-integracao",
        roles: ["Owner"],
      },
      {
        label: "Divisões",
        icon: "mdi:shape-outline",
        to: "/app/configuracoes/divisoes",
        roles: ["Owner"],
        upcoming: true,
      },
      {
        label: "Mídias (retenção)",
        icon: "mdi:database-clock-outline",
        to: "/app/configuracoes/midias",
        roles: ["Owner", "Gestor"],
      },
      {
        label: "Biblioteca de ativos",
        icon: "mdi:bookshelf",
        to: "/app/configuracoes/biblioteca",
        roles: ["Owner", "Gestor"],
      },
      {
        label: "Auditoria",
        icon: "mdi:history",
        to: "/app/configuracoes/auditoria",
        permission: { resource: "audit_log", action: "view" },
      },
      {
        label: "Ambiente & Dados",
        icon: "mdi:swap-horizontal-circle-outline",
        to: "/app/configuracoes/ambiente",
        roles: ["Owner"],
      },
      {
        label: "Segurança da sessão",
        icon: "mdi:timer-lock-outline",
        to: "/app/configuracoes/sessao",
        roles: ["Owner"],
      },
    ],
  },
  {
    label: "Plataforma",
    items: [
      {
        label: "Sobre",
        icon: "mdi:information-outline",
        to: "/app/configuracoes/sobre",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"],
      },
    ],
  },
];

function useVisibleGroups() {
  const { currentUser, userRole } = useAuth();
  return useMemo(() => {
    const isDemo = getActiveDataSource() === "mock";
    return SETTINGS_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.demoOnly && !isDemo) return false;
        if (item.permission) {
          return hasPermission(currentUser, item.permission.resource, item.permission.action);
        }
        if (item.roles && userRole) return item.roles.includes(userRole);
        return false;
      }),
    })).filter((group) => group.items.length > 0);
  }, [currentUser, userRole]);
}

interface ISidebarContentProps {
  groups: ReturnType<typeof useVisibleGroups>;
  activePath: string;
  onNavigate?: () => void;
}

function SidebarContent({ groups, activePath, onNavigate }: ISidebarContentProps) {
  return (
    <nav aria-label="Configurações" className="space-y-6 px-2 py-2">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = activePath === item.to;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon icon={item.icon} size={16} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.upcoming && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Em breve
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Inner sub-sidebar + content layout for /app/configuracoes/*.
 * Sidebar is grouped in 5 categories (Pessoal / Administração / Operação /
 * Integrações / Avançado). Items filter themselves out when the current user
 * lacks the required role or permission (PRD-019 RF-003).
 */
export function SettingsLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const groups = useVisibleGroups();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItemLabel = useMemo(() => {
    for (const g of groups) {
      const found = g.items.find((it) => it.to === location.pathname);
      if (found) return found.label;
    }
    return "Configurações";
  }, [groups, location.pathname]);

  return (
    // Fill <main> minus the sticky TopBar (4rem) and, on desktop, the AppFooter
    // (2rem) — same `md:h-[calc(100vh-6rem)]` convention the list pages use,
    // so <main> doesn't overflow and show a phantom outer scrollbar.
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)]">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
        <div className="px-4 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Configurações
        </div>
        <SidebarContent groups={groups} activePath={location.pathname} />
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <div className="flex items-center justify-between gap-3">
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Icon icon="mdi:menu" size={16} />
                  Menu de configurações
                </Button>
              </SheetTrigger>
              <p className="truncate text-sm font-medium text-foreground">{activeItemLabel}</p>
            </div>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Configurações</SheetTitle>
              <div className="border-b border-border px-4 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Configurações
              </div>
              <SidebarContent
                groups={groups}
                activePath={location.pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
        {/* Uniform wide content width across all settings pages (reclaims side
            space on large monitors). */}
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
