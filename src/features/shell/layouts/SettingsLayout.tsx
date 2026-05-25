import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PermissionAction } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import type { ResourceName } from "@/features/rbac/permissions/resources";

interface ISettingsSection {
  label: string;
  icon: string;
  to: string;
  /** Optional fine-grained gate — falls back to role list when omitted. */
  permission?: { resource: ResourceName; action: PermissionAction };
  roles?: ("Owner" | "Vendedor")[];
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
  {
    label: "Papéis",
    icon: "mdi:shield-account",
    to: "/app/configuracoes/papeis",
    permission: { resource: "role", action: "view" },
  },
  {
    label: "Auditoria",
    icon: "mdi:history",
    to: "/app/configuracoes/auditoria",
    permission: { resource: "audit_log", action: "view" },
  },
];

/**
 * Inner sub-sidebar + content layout for /app/configuracoes/*.
 * Assumes Sidebar + TopBar come from the parent route (`app.tsx`).
 */
export function SettingsLayout({ children }: { children?: ReactNode }) {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();
  const sections = SETTINGS_SECTIONS.filter((s) => {
    if (s.permission) {
      return hasPermission(currentUser, s.permission.resource, s.permission.action);
    }
    if (s.roles) {
      return s.roles.includes(userRole as "Owner" | "Vendedor");
    }
    return true;
  });

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
