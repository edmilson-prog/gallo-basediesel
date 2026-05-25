import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";

interface ISettingsSection {
  label: string;
  icon: string;
  to: string;
  roles: ("Owner" | "Vendedor")[];
}

const SETTINGS_SECTIONS: ISettingsSection[] = [
  { label: "Admin", icon: "mdi:cog-outline", to: "/app/configuracoes", roles: ["Owner"] },
  {
    label: "Perfil",
    icon: "mdi:account",
    to: "/app/configuracoes/perfil",
    roles: ["Owner", "Vendedor"],
  },
  {
    label: "Aparência",
    icon: "mdi:palette",
    to: "/app/configuracoes/aparencia",
    roles: ["Owner", "Vendedor"],
  },
];

/**
 * Inner sub-sidebar + content layout for /app/configuracoes/*.
 * Assumes Sidebar + TopBar come from the parent route (`app.tsx`).
 */
export function SettingsLayout({ children }: { children?: ReactNode }) {
  const { userRole } = useAuth();
  const location = useLocation();
  const sections = SETTINGS_SECTIONS.filter((s) =>
    s.roles.includes(userRole as "Owner" | "Vendedor"),
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block">
        <div className="px-4 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Configurações
        </div>
        <ul className="space-y-0.5 px-2">
          {sections.map((s) => {
            const active = location.pathname === s.to;
            return (
              <li key={s.to}>
                <Link
                  to={s.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon icon={s.icon} size={16} />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
