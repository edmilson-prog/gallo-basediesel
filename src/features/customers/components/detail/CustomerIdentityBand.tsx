import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import type { CustomerDetailLayout } from "../../hooks/useCustomerDetailLayout";
import { CustomerBreadcrumb } from "./CustomerBreadcrumb";
import { CustomerQuickActions } from "./CustomerQuickActions";
import { CustomerLayoutToggle } from "./CustomerLayoutToggle";
import type { CustomerTabKey } from "../CustomerTabs";

export interface ICustomerIdentityBandProps {
  customer: ICustomer;
  latestConversationId: string | null;
  onGoToTab: (tab: CustomerTabKey) => void;
  onEditData?: () => void;
  layout: CustomerDetailLayout;
  onToggleLayout: () => void;
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
  layout,
  onToggleLayout,
}: ICustomerIdentityBandProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();
  // Pulse handed to ProfileMenu, which owns the transfer modal — the quick
  // action and the menu item open the very same dialog.
  const [transferSignal, setTransferSignal] = useState(0);

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <div className="space-y-2.5 px-4 py-3 sm:px-6">
      <CustomerBreadcrumb name={display.name} />

      <div className="flex flex-wrap items-start gap-3.5">
        <CustomerAvatar
          display={display}
          shape="square"
          className="h-[52px] w-[52px] shrink-0 text-lg"
          iconSize={26}
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <h1
            className="truncate font-display text-2xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground sm:text-[26px]"
            title={display.name}
          >
            {display.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProfileBadges
              customer={customer}
              variant="detail"
              preConversionSlot={<PreConversionBadge customer={customer} />}
            />
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <CustomerQuickActions
            customer={customer}
            latestConversationId={latestConversationId}
            onGoToTab={onGoToTab}
            onTransferWallet={() => setTransferSignal((n) => n + 1)}
          />
          <Button
            variant="default"
            size="sm"
            className="h-[34px] gap-1.5 font-display font-bold uppercase tracking-[0.045em]"
            onClick={handleCreateQuote}
          >
            <Icon icon="mdi:file-document-plus-outline" size={14} />
            {CUSTOMER_STRINGS.header.createQuote}
          </Button>
          <CustomerLayoutToggle layout={layout} onToggle={onToggleLayout} />
          <ProfileMenu
            customer={customer}
            onEditData={onEditData}
            transferSignal={transferSignal}
          />
        </div>
      </div>

      {/* Renders nothing when there is no active coverage, so it lives inside
          this band rather than as a band of its own — an empty band would still
          draw its divider. */}
      <CoverageBanner customer={customer} />
    </div>
  );
}
