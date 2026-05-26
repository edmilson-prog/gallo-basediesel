import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { daysSince, formatDateBR } from "@/shared/utils/format";

export interface IPreConversionBadgeProps {
  customer: ICustomer;
}

/**
 * Badge + Popover combo shown on the profile header when
 * `customer.convertedFromLeadId` is set. Clicking opens a popover with the
 * lead origin details and a deep link to the Pipeline (PRD-017).
 *
 * Lead and seller details are fetched lazily on first open — the badge itself
 * only requires fields already present on `ICustomer`.
 */
export function PreConversionBadge({ customer }: IPreConversionBadgeProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const leadsProvider = useLeadsProvider();
  const sellersProvider = useSellersProvider();
  const leadId = customer.convertedFromLeadId;

  const leadQuery = useQuery({
    queryKey: ["lead", leadId] as const,
    enabled: open && Boolean(leadId),
    staleTime: 60 * 1000,
    queryFn: async () => (leadId ? leadsProvider.get(leadId).catch(() => null) : null),
  });

  const sellerId = customer.convertedBySellerId;
  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId] as const,
    enabled: open && Boolean(sellerId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (sellerId ? sellersProvider.get(sellerId).catch(() => null) : null),
  });

  if (!leadId) return null;

  const conversionDays =
    customer.convertedFromLeadAt && leadQuery.data
      ? Math.max(
          1,
          (daysSince(leadQuery.data.createdAt) ?? 0) -
            (daysSince(customer.convertedFromLeadAt) ?? 0),
        )
      : null;

  const handleViewLead = () => {
    void navigate({ to: `/app/leads/${leadId}` as never });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 transition hover:bg-amber-500/25 focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-amber-300"
          aria-label={CUSTOMER_STRINGS.preConversion.badge}
        >
          <Icon icon="mdi:history" size={11} />
          {CUSTOMER_STRINGS.preConversion.badge}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 space-y-3 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <Icon icon="mdi:account-convert" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {CUSTOMER_STRINGS.preConversion.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {customer.type === "B2B" ? customer.nomeFantasia : customer.fullName}
            </p>
          </div>
        </div>

        <dl className="space-y-1.5 text-xs">
          <DetailRow
            label={CUSTOMER_STRINGS.preConversion.leadCreated}
            value={
              leadQuery.isLoading ? (
                <Skeleton className="h-3 w-16" />
              ) : leadQuery.data ? (
                formatDateBR(leadQuery.data.createdAt)
              ) : (
                "—"
              )
            }
          />
          <DetailRow
            label={CUSTOMER_STRINGS.preConversion.convertedAt}
            value={formatDateBR(customer.convertedFromLeadAt)}
          />
          {conversionDays !== null && (
            <DetailRow
              label="Tempo"
              value={CUSTOMER_STRINGS.preConversion.daysToConvert(conversionDays)}
            />
          )}
          <DetailRow
            label={CUSTOMER_STRINGS.preConversion.convertedBy}
            value={
              sellerQuery.isLoading ? (
                <Skeleton className="h-3 w-20" />
              ) : sellerQuery.data ? (
                sellerQuery.data.fullName
              ) : (
                "—"
              )
            }
          />
        </dl>

        <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={handleViewLead}>
          <Icon icon="mdi:open-in-new" size={12} />
          {CUSTOMER_STRINGS.preConversion.viewLead}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
