import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Icon } from "@/components/Icon";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { AccountSidebar } from "./AccountSidebar";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export interface IAccountLayoutProps {
  children: React.ReactNode;
}

/**
 * Shell layout for `/loja/conta/*` (PRD-065 RF-019/020).
 *
 * Renders the sidebar + main content on desktop; on mobile the sidebar lives
 * inside a Sheet triggered by the header button.
 */
export function AccountLayout({ children }: IAccountLayoutProps) {
  const { customer, isHydrating } = useCustomerAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isHydrating) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    );
  }

  if (!customer) {
    // Token expired between hydrate and now — bounce back to login.
    return <Navigate to="/loja/login" />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:py-10 lg:pb-12">
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Icon icon="mdi:menu" size={16} aria-hidden />
              {S.mobileMenuTitle}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle className="text-left">{S.mobileMenuTitle}</SheetTitle>
            </SheetHeader>
            <AccountSidebar customer={customer} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar customer={customer} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
