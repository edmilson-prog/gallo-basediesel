import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { initialsFrom } from "@/shared/utils/avatar";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

/**
 * Session control rendered in the storefront header (PRD-065 RF-041/042).
 *
 * Anonymous visitors see an "Entrar" link; authenticated customers see their
 * avatar + a dropdown with shortcuts and logout.
 */
export function CustomerAccountMenu() {
  const { isAuthenticated, customer, logout } = useCustomerAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !customer) {
    return (
      <Button variant="ghost" size="sm" asChild className="hidden gap-2 text-sm sm:inline-flex">
        <Link to="/loja/login">
          <Icon icon="mdi:login" size={18} aria-hidden />
          Entrar
        </Link>
      </Button>
    );
  }

  const name = getCustomerName(customer);
  const initials = initialsFrom(name);

  const handleLogout = () => {
    logout();
    toast.success(S.logoutSuccess);
    void navigate({ to: "/loja" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden gap-2 text-sm sm:inline-flex">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="hidden max-w-28 truncate md:inline">{name}</span>
          <Icon icon="mdi:chevron-down" size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/loja/conta" })} className="gap-2">
          <Icon icon="mdi:account-circle-outline" size={16} aria-hidden />
          {S.headerDropdownAccount}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void navigate({ to: "/loja/conta/pedidos" })}
          className="gap-2"
        >
          <Icon icon="mdi:clipboard-list-outline" size={16} aria-hidden />
          {S.headerDropdownOrders}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout} className="gap-2 text-destructive">
          <Icon icon="mdi:logout" size={16} aria-hidden />
          {S.headerDropdownLogout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
