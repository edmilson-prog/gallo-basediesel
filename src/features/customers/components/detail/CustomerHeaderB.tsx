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
import type { IMonthlyPurchasePoint } from "../../utils/purchaseSeries";
import type { ICustomerCredit } from "../../engine/customerCredit";
import type { ICustomerAlert } from "../../engine/customerAlerts";
import type { CustomerDetailLayout } from "../../hooks/useCustomerDetailLayout";
import { CustomerBreadcrumb } from "./CustomerBreadcrumb";
import { CustomerFact } from "./CustomerFact";
import { buildCustomerFactCells } from "./customerFactCells";
import { CustomerQuickActions } from "./CustomerQuickActions";
import { CustomerCommercialPanel } from "./CustomerCommercialPanel";
import { CustomerAlertsBand } from "./CustomerAlertsBand";
import { CustomerLayoutToggle } from "./CustomerLayoutToggle";
import type { CustomerTabKey } from "../CustomerTabs";

export interface ICustomerHeaderBProps {
  customer: ICustomer;
  sellerName: string | null;
  storeName: string | null;
  latestConversationId: string | null;
  credit: ICustomerCredit | null;
  series: IMonthlyPurchasePoint[];
  hasPurchaseHistory: boolean;
  openQuotes: number;
  alerts: ICustomerAlert[];
  onGoToTab: (tab: CustomerTabKey) => void;
  onEditData?: () => void;
  onCreateQuote: () => void;
  layout: CustomerDetailLayout;
  onToggleLayout: () => void;
}

/**
 * Direction B of the kit — one two-column header instead of stacked bands:
 * registration and contact on the left, commercial situation on the right.
 *
 * Fewer dividing lines and more of a "file card" feel than direction A, at the
 * cost of a taller fixed block: the columns hold their height even when one
 * side has little to say. Alerts stay full width below, as in both directions.
 */
export function CustomerHeaderB({
  customer,
  sellerName,
  storeName,
  latestConversationId,
  credit,
  series,
  hasPurchaseHistory,
  openQuotes,
  alerts,
  onGoToTab,
  onEditData,
  onCreateQuote,
  layout,
  onToggleLayout,
}: ICustomerHeaderBProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();
  const [transferSignal, setTransferSignal] = useState(0);
  const cells = buildCustomerFactCells(customer, sellerName, storeName);

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <header className="shrink-0 border-b border-border bg-card px-4 pb-4 pt-3 sm:px-6">
      <CustomerBreadcrumb name={display.name} />

      <div className="mt-2.5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_1px_minmax(340px,0.72fr)]">
        <div className="min-w-0">
          <div className="flex items-start gap-3.5">
            <CustomerAvatar
              display={display}
              shape="square"
              className="h-12 w-12 shrink-0 text-base"
              iconSize={24}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <h1
                className="truncate font-display text-2xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground"
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
          </div>

          {/* Two columns of facts instead of direction A's single divided row —
              the same cells, from the same builder. */}
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 border-t border-border pt-3.5 sm:grid-cols-2">
            {cells.map(({ key, ...fact }) => (
              <CustomerFact key={key} {...fact} />
            ))}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
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

          <CoverageBanner customer={customer} />
        </div>

        <div className="hidden bg-border lg:block" aria-hidden />

        <CustomerCommercialPanel
          customer={customer}
          credit={credit}
          series={series}
          hasPurchaseHistory={hasPurchaseHistory}
          openQuotes={openQuotes}
          onCreateQuote={onCreateQuote}
        />
      </div>

      {alerts.length > 0 && (
        <div className="mt-3.5 border-t border-border pt-3.5">
          <CustomerAlertsBand alerts={alerts} onGoToTab={onGoToTab} />
        </div>
      )}
    </header>
  );
}
