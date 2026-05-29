import { useState } from "react";
import { Link, useLocation, useNavigate, Navigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/features/shell/components/AppFooter";
import { usePortalSeed } from "../hooks/usePortalSeed";
import { usePortalAuth } from "../hooks/usePortalAuth";
import { usePortalSession } from "../hooks/usePortalSession";
import { PORTAL_NAV } from "../config/navigation";
import { PORTAL_ROLE_LABEL, PORTAL_STRINGS as S } from "../i18n/pt-BR";

function NavList({
  onNavigate,
  canViewFinancial,
  role,
}: {
  onNavigate?: () => void;
  canViewFinancial: boolean;
  role: string;
}) {
  const { pathname } = useLocation();
  const items = PORTAL_NAV.filter((item) => {
    if (item.requires === "canViewFinancial" && !canViewFinancial) return false;
    if (item.roles && !item.roles.includes(role as never)) return false;
    return true;
  });
  return (
    <nav className="space-y-1 p-2">
      {items.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-amber-400/15 text-amber-600 dark:text-amber-300"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon icon={item.icon} size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Dedicated shell for the B2B portal (PRD-071 RF-001/003). Institutional dark
 * header + sidebar on desktop, drawer on mobile. Login is chrome-free.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  usePortalSeed();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, logout } = usePortalAuth();
  const { user, customer } = usePortalSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLogin = pathname.startsWith("/portal/login");

  if (isLogin) {
    return <div className="min-h-screen bg-background text-foreground">{children}</div>;
  }

  if (!session) {
    return <Navigate to="/portal/login" />;
  }

  const companyName =
    customer && customer.type === "B2B"
      ? customer.nomeFantasia || customer.razaoSocial
      : (customer?.fullName ?? "Empresa");
  const canViewFinancial = user?.canViewFinancial ?? false;

  const handleLogout = () => {
    logout();
    void navigate({ to: "/portal/login" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Institutional header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-zinc-900 px-4 text-zinc-100">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-100 lg:hidden">
              <Icon icon="mdi:menu" size={22} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle className="text-left">{companyName}</SheetTitle>
            </SheetHeader>
            <NavList
              onNavigate={() => setDrawerOpen(false)}
              canViewFinancial={canViewFinancial}
              role={session.role}
            />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <Icon icon="mdi:hexagon-multiple" size={22} className="text-amber-400" aria-hidden />
          <span className="font-display text-sm font-bold tracking-wide">{S.brand}</span>
        </div>

        <span className="ml-2 hidden text-sm text-zinc-400 sm:inline">· {companyName}</span>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium leading-tight">{session.userName}</p>
            <p className="text-[11px] leading-tight text-zinc-400">
              {PORTAL_ROLE_LABEL[session.role]}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-100 hover:bg-zinc-800"
            onClick={handleLogout}
            aria-label={S.logout}
          >
            <Icon icon="mdi:logout" size={18} />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
          <div className="sticky top-14">
            <NavList canViewFinancial={canViewFinancial} role={session.role} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>

      <AppFooter className="flex" showWhatsNew={false} />
    </div>
  );
}
