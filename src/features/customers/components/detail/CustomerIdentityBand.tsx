import { Link, useNavigate } from "@tanstack/react-router";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CoverageBanner } from "@/features/carteira/components/CoverageBanner";
import { CustomerAvatar } from "../CustomerAvatar";
import { ProfileBadges } from "../ProfileBadges";
import { PreConversionBadge } from "../PreConversionBadge";
import { ProfileMenu } from "../ProfileMenu";
import { getCustomerDisplay } from "../../utils/customerDisplay";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { CustomerQuickActions } from "./CustomerQuickActions";
import type { CustomerTabKey } from "../CustomerTabs";

export interface ICustomerIdentityBandProps {
  customer: ICustomer;
  latestConversationId: string | null;
  onGoToTab: (tab: CustomerTabKey) => void;
  onEditData?: () => void;
}

/**
 * Band 1 — who this customer is and what you can do about it right now.
 *
 * Tags used to be visible only inside the "Visão geral" tab; they sit next to
 * the status badges here because they are how the team actually segments a
 * customer ("Prazo 30d", "Frota própria").
 */
export function CustomerIdentityBand({
  customer,
  latestConversationId,
  onGoToTab,
  onEditData,
}: ICustomerIdentityBandProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <div className="space-y-2.5 px-4 py-3 sm:px-6">
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

      <div className="flex flex-wrap items-start gap-3">
        <CustomerAvatar display={display} className="h-14 w-14 shrink-0 text-base" iconSize={26} />

        <div className="min-w-0 flex-1 space-y-1.5">
          <h1
            className="truncate text-xl font-semibold uppercase leading-tight text-foreground"
            title={display.name}
          >
            {display.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProfileBadges
              customer={customer}
              preConversionSlot={<PreConversionBadge customer={customer} />}
            />
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <CustomerQuickActions
            customer={customer}
            latestConversationId={latestConversationId}
            onGoToTab={onGoToTab}
          />
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleCreateQuote}>
            <Icon icon="mdi:file-document-plus-outline" size={14} />
            {CUSTOMER_STRINGS.header.createQuote}
          </Button>
          <ProfileMenu customer={customer} onEditData={onEditData} />
        </div>
      </div>

      {/* Renders nothing when there is no active coverage, so it lives inside
          this band rather than as a band of its own — an empty band would still
          draw its divider. */}
      <CoverageBanner customer={customer} />
    </div>
  );
}
