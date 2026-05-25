import { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { APP_NAV_GROUPS, type INavGroup } from "@/features/shell/config/navigation";

const COLLAPSED_KEY = "gallo-sidebar-collapsed";

function readCollapsedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPref(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

function filterGroupsByRole(groups: INavGroup[], role: string | null): INavGroup[] {
  if (!role) return [];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role as never)),
    }))
    .filter((group) => group.items.length > 0);
}

export function Sidebar() {
  const { userRole } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => readCollapsedPref());

  useEffect(() => {
    writeCollapsedPref(collapsed);
  }, [collapsed]);

  const groups = filterGroupsByRole(APP_NAV_GROUPS, userRole);

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col border-r border-border bg-card text-card-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
      aria-label="Navegação principal"
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && <Logo variant="horizontal" className="h-6" />}
        {collapsed && <Logo variant="mark" className="h-6 w-6" />}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <Icon icon={collapsed ? "mdi:chevron-right" : "mdi:chevron-left"} size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <h3 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active =
                  location.pathname === item.to ||
                  (item.to !== "/app/inicio" && location.pathname.startsWith(item.to));
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        collapsed && "justify-center px-0",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon icon={item.icon} size={18} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
