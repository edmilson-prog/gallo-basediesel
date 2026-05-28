import { Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { initialsFrom } from "@/shared/utils/avatar";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export interface IAccountNavItem {
  to: string;
  label: string;
  icon: string;
  b2bOnly?: boolean;
}

const NAV: IAccountNavItem[] = [
  { to: "/loja/conta", label: S.navDashboard, icon: "mdi:view-dashboard-outline" },
  { to: "/loja/conta/pedidos", label: S.navOrders, icon: "mdi:clipboard-list-outline" },
  { to: "/loja/conta/orcamentos", label: S.navQuotes, icon: "mdi:file-document-outline" },
  { to: "/loja/conta/perfil", label: S.navProfile, icon: "mdi:account-circle-outline" },
  { to: "/loja/conta/enderecos", label: S.navAddresses, icon: "mdi:map-marker-outline" },
  {
    to: "/loja/conta/veiculos",
    label: S.navVehicles,
    icon: "mdi:truck-outline",
    b2bOnly: true,
  },
];

export interface IAccountSidebarProps {
  customer: ICustomer;
  onNavigate?: () => void;
  className?: string;
}

export function AccountSidebar({ customer, onNavigate, className }: IAccountSidebarProps) {
  const { logout } = useCustomerAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const items = NAV.filter((item) => !item.b2bOnly || customer.type === "B2B");
  const name = getCustomerName(customer);
  const initials = initialsFrom(name);

  const handleLogout = () => {
    logout();
    toast.success(S.logoutSuccess);
    onNavigate?.();
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col gap-4 border-border bg-background p-4 lg:rounded-lg lg:border",
        className,
      )}
    >
      <header className="flex items-center gap-3 px-1 pt-1 pb-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {customer.type === "B2B" ? "Cliente B2B" : "Cliente B2C"}
          </p>
        </div>
      </header>

      <nav className="flex flex-col gap-0.5" aria-label="Menu da conta">
        {items.map((item) => {
          const isActive =
            item.to === "/loja/conta"
              ? pathname === "/loja/conta"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/60",
              )}
            >
              <Icon icon={item.icon} size={18} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Icon icon="mdi:logout" size={18} aria-hidden />
          {S.navLogout}
        </button>
      </div>
    </aside>
  );
}
