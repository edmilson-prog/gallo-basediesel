import { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { APP_NAV_GROUPS, type INavGroup } from "@/features/shell/config/navigation";

const COLLAPSED_KEY = "gallo-sidebar-collapsed";
const COLLAPSED_GROUPS_KEY = "gallo-sidebar-groups";

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

/** Group labels the user has collapsed. Absent = expanded (default). */
function readCollapsedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeCollapsedGroups(groups: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...groups]));
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => readCollapsedGroups());

  useEffect(() => {
    writeCollapsedPref(collapsed);
  }, [collapsed]);

  useEffect(() => {
    writeCollapsedGroups(collapsedGroups);
  }, [collapsedGroups]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

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

      <nav className="scrollbar-hide flex-1 overflow-y-auto py-3">
        {groups.map((group) => {
          const groupOpen = collapsed || !collapsedGroups.has(group.label);
          return (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={groupOpen}
                  className="flex w-full items-center justify-between px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{group.label}</span>
                  <Icon
                    icon="mdi:chevron-down"
                    size={16}
                    className={cn(
                      "shrink-0 transition-transform duration-200",
                      !groupOpen && "-rotate-90",
                    )}
                  />
                </button>
              )}
              {groupOpen && (
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
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
