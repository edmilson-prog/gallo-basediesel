import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

const ITEMS = [
  { to: "/pwa/inicio", icon: "mdi:home-variant", label: S.navHome },
  { to: "/pwa/carteira", icon: "mdi:account-multiple", label: S.navPortfolio },
  { to: "/pwa/orcamento-rapido", icon: "mdi:file-document-plus", label: S.navQuote },
  { to: "/pwa/agenda", icon: "mdi:calendar-month", label: S.navAgenda },
  { to: "/pwa/eu", icon: "mdi:account", label: S.navProfile },
] as const;

/** Bottom navigation for the external-seller PWA (PRD-070 RF-002). */
export function PWABottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon icon={item.icon} size={22} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
