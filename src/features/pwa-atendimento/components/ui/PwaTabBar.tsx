import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaTabBarProps {
  /** Conversations carrying unread messages. */
  unreadCount: number;
  /** Conversations with nobody assigned. */
  queueCount: number;
}

/**
 * Conversas, Espera e — para quem pode ver — Análise. Conta e sair ficam atrás
 * do avatar do cabeçalho, não aqui embaixo.
 *
 * A terceira aba **não é montada** para quem não tem o recurso na matriz de
 * Papéis, em vez de aparecer e negar o acesso depois: uma aba que só serve para
 * dizer "não pode" é ruído permanente na barra.
 */
export function PwaTabBar({ unreadCount, queueCount }: IPwaTabBarProps) {
  const { pathname } = useLocation();
  const canSeeAnalise = usePermission("customer_service_analytics", "view");

  const items = [
    {
      to: "/atendimento/conversas",
      label: S.nav.conversations,
      icon: "mdi:message-outline",
      badge: unreadCount,
    },
    { to: "/atendimento/espera", label: S.nav.queue, icon: "mdi:clock-outline", badge: queueCount },
    ...(canSeeAnalise
      ? [
          {
            to: "/atendimento/analise" as const,
            label: S.nav.analise,
            icon: "mdi:chart-line",
            badge: 0,
          },
        ]
      : []),
  ] as const;

  return (
    <nav
      aria-label="Navegação principal"
      className="flex shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className="relative flex flex-1 flex-col items-center gap-1 py-2 pb-1.5"
          >
            <span
              className={cn(
                "absolute inset-x-[26%] top-0 h-0.5",
                active ? "bg-primary" : "bg-transparent",
              )}
              aria-hidden
            />
            <span className="relative">
              <Icon
                icon={item.icon}
                size={20}
                className={active ? "text-foreground" : "text-muted-foreground"}
              />
              {item.badge > 0 && (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-primary-foreground">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-[10.5px] font-bold uppercase tracking-[0.06em]",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
