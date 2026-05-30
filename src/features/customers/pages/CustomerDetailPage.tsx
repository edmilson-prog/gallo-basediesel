import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCustomerProfile } from "../hooks/useCustomerProfile";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { ProfileTabs, type TabKey } from "../components/ProfileTabs";
import { CustomerDetailHeader } from "../components/detail/CustomerDetailHeader";
import { CustomerStatStrip } from "../components/detail/CustomerStatStrip";
import { CustomerPurchaseEvolutionCard } from "../components/detail/CustomerPurchaseEvolutionCard";
import { CustomerRelationshipTimeline } from "../components/detail/CustomerRelationshipTimeline";
import {
  CustomerPendingActionsCard,
  type PendingTabTarget,
} from "../components/detail/CustomerPendingActionsCard";

export interface ICustomerDetailPageProps {
  customerId: ID;
}

export function CustomerDetailPage({ customerId }: ICustomerDetailPageProps) {
  const { customer, isLoading, isError, notFound, refetch } = useCustomerProfile(customerId);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleNavigateTab = (target: PendingTabTarget) => {
    setActiveTab(target as TabKey);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
          <Icon icon={notFound ? "mdi:account-question-outline" : "mdi:alert-circle-outline"} size={24} />
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
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/clientes" })}>
            <Icon icon="mdi:arrow-left" size={14} />
            {CUSTOMER_STRINGS.backToList}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
        <CustomerDetailHeader customer={customer} />

        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <CustomerStatStrip customer={customer} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <CustomerPurchaseEvolutionCard customer={customer} className="lg:col-span-6" />
            <CustomerRelationshipTimeline customer={customer} className="lg:col-span-3" />
            <CustomerPendingActionsCard
              customer={customer}
              onNavigateTab={handleNavigateTab}
              className="lg:col-span-3"
            />
          </div>

          <div ref={tabsRef} className="rounded-lg border border-border bg-card">
            <ProfileTabs
              customer={customer}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              overviewVariant="page"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
