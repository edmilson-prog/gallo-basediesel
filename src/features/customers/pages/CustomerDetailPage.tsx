import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ICustomer, ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCustomerProfile } from "../hooks/useCustomerProfile";
import { useCustomerHeader } from "../hooks/useCustomerHeader";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { getCustomerName } from "../utils/customerDisplay";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { CustomerTabs, type CustomerTabKey } from "../components/CustomerTabs";
import { CustomerIdentityBand } from "../components/detail/CustomerIdentityBand";
import { CustomerFactsBand } from "../components/detail/CustomerFactsBand";
import { CustomerCommercialBand } from "../components/detail/CustomerCommercialBand";
import { CustomerAlertsBand } from "../components/detail/CustomerAlertsBand";
import { CustomerHeaderB } from "../components/detail/CustomerHeaderB";
import { useCustomerDetailLayout } from "../hooks/useCustomerDetailLayout";

export interface ICustomerDetailPageProps {
  customerId: ID;
}

export function CustomerDetailPage({ customerId }: ICustomerDetailPageProps) {
  const { customer, isLoading, isError, notFound, refetch } = useCustomerProfile(customerId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ProfileSkeleton variant="page" />
      </div>
    );
  }

  if (notFound || isError || !customer) {
    const copy = notFound ? CUSTOMER_STRINGS.notFound : CUSTOMER_STRINGS.loadError;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon
            icon={notFound ? "mdi:account-question-outline" : "mdi:alert-circle-outline"}
            size={24}
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-sm font-semibold text-foreground">{copy.title}</h1>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex gap-2">
          {isError && !notFound && (
            <Button variant="secondary" size="sm" onClick={refetch}>
              {CUSTOMER_STRINGS.loadError.retry}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: "/app/clientes" })}
          >
            <Icon icon="mdi:arrow-left" size={14} />
            {CUSTOMER_STRINGS.backToList}
          </Button>
        </div>
      </div>
    );
  }

  // Split so the hooks below only ever run with a resolved customer — the
  // guards above return before any of them mount.
  return <CustomerDetailContent customer={customer} />;
}

function CustomerDetailContent({ customer }: { customer: ICustomer }) {
  const navigate = useNavigate();
  const header = useCustomerHeader(customer);
  const { layout, toggle: toggleLayout } = useCustomerDetailLayout();
  const [activeTab, setActiveTab] = useState<CustomerTabKey>("comercial");
  const [editSignal, setEditSignal] = useState(0);
  const defaultTabApplied = useRef(false);

  /**
   * The old page always opened on "Atendimento", which is the tab most often
   * empty — the first click was always to leave it. Now the landing tab follows
   * the data: pendings first, commercial otherwise.
   *
   * Applied once per customer, and only after the counts settle, so it never
   * yanks the tab out from under someone who already clicked.
   */
  useEffect(() => {
    defaultTabApplied.current = false;
  }, [customer.id]);

  useEffect(() => {
    if (defaultTabApplied.current) return;
    if (header.alerts.length === 0) return;
    defaultTabApplied.current = true;
    setActiveTab("atendimento");
  }, [header.alerts.length]);

  const goToTab = (tab: CustomerTabKey) => {
    defaultTabApplied.current = true;
    setActiveTab(tab);
  };

  const handleEditData = () => {
    goToTab("cadastro");
    setEditSignal((n) => n + 1);
  };

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  // Same destination as the header's "Agendar retorno": the follow-up date is a
  // field of the agenda's contact record, not of the customer.
  const handleScheduleFollowUp = () => {
    const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";
    void navigate({
      to: "/app/agenda",
      search: { q: phoneDigits || getCustomerName(customer) },
    } as never);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-full flex-col bg-background">
        {layout === "painel" ? (
          /* Direction B — one two-column header. Kept switchable so both
             directions of the kit can be judged against real data. */
          <CustomerHeaderB
            customer={customer}
            sellerName={header.sellerName}
            storeName={header.storeName}
            latestConversationId={header.latestConversationId}
            credit={header.credit}
            series={header.series}
            hasPurchaseHistory={header.hasPurchaseHistory}
            openQuotes={header.openQuotes}
            alerts={header.alerts}
            onGoToTab={goToTab}
            onEditData={handleEditData}
            onCreateQuote={handleCreateQuote}
            layout={layout}
            onToggleLayout={toggleLayout}
          />
        ) : (
          /* Direction A — header bands: identity → facts → commercial → alerts.
             Each one is only as tall as its content, and the alert band
             disappears entirely when there is nothing pending. */
          <header className="shrink-0 divide-y divide-border border-b border-border bg-card">
            <CustomerIdentityBand
              customer={customer}
              latestConversationId={header.latestConversationId}
              onGoToTab={goToTab}
              onEditData={handleEditData}
              layout={layout}
              onToggleLayout={toggleLayout}
            />
            <CustomerFactsBand
              customer={customer}
              sellerName={header.sellerName}
              storeName={header.storeName}
            />
            <CustomerCommercialBand
              customer={customer}
              credit={header.credit}
              series={header.series}
              hasPurchaseHistory={header.hasPurchaseHistory}
              openQuotes={header.openQuotes}
              onCreateQuote={handleCreateQuote}
            />
            {header.alerts.length > 0 && (
              <div className="px-4 py-3 sm:px-6">
                <CustomerAlertsBand alerts={header.alerts} onGoToTab={goToTab} />
              </div>
            )}
          </header>
        )}

        <CustomerTabs
          customer={customer}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          counts={header.counts}
          alerts={header.alerts}
          onGoToTab={goToTab}
          cadastraisEditSignal={editSignal}
          onCadastraisEditConsumed={() => setEditSignal(0)}
          onScheduleFollowUp={handleScheduleFollowUp}
        />
      </div>
    </TooltipProvider>
  );
}
