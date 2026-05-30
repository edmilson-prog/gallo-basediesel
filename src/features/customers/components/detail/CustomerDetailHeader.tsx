import { Link, useNavigate } from "@tanstack/react-router";
import type { ICustomer } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CoverageBanner } from "@/features/carteira/components/CoverageBanner";
import { getCustomerDisplay } from "../../utils/customerDisplay";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { ProfileBadges } from "../ProfileBadges";
import { PreConversionBadge } from "../PreConversionBadge";
import { ProfileMenu } from "../ProfileMenu";

export interface ICustomerDetailHeaderProps {
  customer: ICustomer;
}

export function CustomerDetailHeader({ customer }: ICustomerDetailHeaderProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-5 sm:px-6">
        <nav
          className="flex items-center gap-1 text-xs text-muted-foreground"
          aria-label="breadcrumb"
        >
          <Link
            to="/app/clientes"
            className="rounded transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CUSTOMER_STRINGS.detail.breadcrumb}
          </Link>
          <span aria-hidden>
            <Icon icon="mdi:chevron-right" size={14} />
          </span>
          <span className="truncate text-foreground">{display.name}</span>
        </nav>

        <div className="flex items-start gap-3">
          <Avatar className="h-16 w-16 shrink-0 text-lg">
            <AvatarFallback
              className="font-semibold"
              style={{ backgroundColor: display.bg, color: display.fg }}
              aria-hidden
            >
              {display.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1
              className="text-xl font-semibold uppercase leading-tight text-foreground"
              title={display.name}
            >
              {display.name}
            </h1>
            <ProfileBadges
              customer={customer}
              preConversionSlot={<PreConversionBadge customer={customer} />}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="default" size="sm" className="gap-1.5" onClick={handleCreateQuote}>
              <Icon icon="mdi:file-document-plus-outline" size={14} />
              {CUSTOMER_STRINGS.header.createQuote}
            </Button>
            <ProfileMenu customer={customer} />
          </div>
        </div>

        <CoverageBanner customer={customer} />
      </div>
    </header>
  );
}
