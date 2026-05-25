import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { APP_NAV_GROUPS, BOTTOM_NAV, type INavItem } from "@/features/shell/config/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function pickItemsForRole(role: string | null): INavItem[] {
  if (role === "Owner") return BOTTOM_NAV.Owner;
  if (role === "Vendedor") return BOTTOM_NAV.Vendedor;
  return [];
}

export function BottomNav() {
  const { userRole } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = pickItemsForRole(userRole);

  if (items.length === 0) return null;

  const allItemsFlat = APP_NAV_GROUPS.flatMap((g) => g.items).filter((item) =>
    item.roles.includes(userRole as never),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-background md:hidden"
      aria-label="Navegação mobile"
    >
      {items.map((item) => {
        const active =
          location.pathname === item.to ||
          (item.to !== "/app/inicio" && location.pathname.startsWith(item.to));
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-xs",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon icon={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
            aria-label="Mais"
          >
            <Icon icon="mdi:menu" size={20} />
            <span>Mais</span>
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="border-b border-border px-4 py-4">
            <SheetTitle>Mais opções</SheetTitle>
          </SheetHeader>
          <ul className="overflow-y-auto py-2">
            {allItemsFlat.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon icon={item.icon} size={18} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
