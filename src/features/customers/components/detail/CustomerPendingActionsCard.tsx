import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useRecommendationsProvider } from "@/providers/data/hooks/useRecommendationsProvider";
import { daysSince } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.pending;
const MVP_REC_TYPES = ["recovery", "vehicle_maintenance", "follow_up"] as const;

/** Tab keys the timeline/pending blocks can deep-link into. */
export type PendingTabTarget = "quotes" | "vehicles" | "recommendations" | "orders";

export interface ICustomerPendingActionsCardProps {
  customer: ICustomer;
  onNavigateTab: (tab: PendingTabTarget) => void;
  className?: string;
}

interface IPendingItem {
  icon: string;
  label: string;
  count?: number;
  hint?: string;
  target: PendingTabTarget;
  critical?: boolean;
}

export function CustomerPendingActionsCard({
  customer,
  onNavigateTab,
  className,
}: ICustomerPendingActionsCardProps) {
  const quotesProvider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const recommendationsProvider = useRecommendationsProvider();

  const openQuotes = useQuery({
    queryKey: ["pending-open-quotes", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      quotesProvider
        .list({ customerId: customer.id, pageSize: 200 })
        .then(
          (r) => r.data.filter((q) => q.status === "enviado" || q.status === "rascunho").length,
        ),
  });

  const pendingVehicles = useQuery({
    queryKey: ["pending-vehicles-approval", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      vehiclesProvider
        .listByCustomer(customer.id)
        .then((vs) => vs.filter((v) => v.cadastroStatus === "pendente").length),
  });

  const unseenRecs = useQuery({
    queryKey: ["pending-recommendations", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      recommendationsProvider
        .list({
          subjectId: customer.id,
          resolved: false,
          type: [...MVP_REC_TYPES],
          pageSize: 50,
        })
        .then((r) => r.data.length),
  });

  // Overdue repurchase heuristic: recency exceeds the average days between
  // purchases (derived from orderCount12m over a 365-day window).
  const overdueDays = useMemo(() => {
    if (!customer.lastPurchaseAt) return null;
    const stats = customer.purchaseStats;
    if (!stats || stats.orderCount12m <= 0) return null;
    const avgInterval = 365 / stats.orderCount12m;
    const recency = daysSince(customer.lastPurchaseAt);
    if (recency === null) return null;
    return recency > avgInterval * 1.5 ? recency : null;
  }, [customer]);

  const items = useMemo<IPendingItem[]>(() => {
    const out: IPendingItem[] = [];
    if ((openQuotes.data ?? 0) > 0) {
      out.push({
        icon: "mdi:file-document-outline",
        label: COPY.openQuotes,
        count: openQuotes.data,
        target: "quotes",
      });
    }
    if ((pendingVehicles.data ?? 0) > 0) {
      out.push({
        icon: "mdi:truck-alert-outline",
        label: COPY.vehiclesToApprove,
        count: pendingVehicles.data,
        target: "vehicles",
        critical: true,
      });
    }
    if ((unseenRecs.data ?? 0) > 0) {
      out.push({
        icon: "mdi:lightbulb-on-outline",
        label: COPY.unseenRecommendations,
        count: unseenRecs.data,
        target: "recommendations",
      });
    }
    if (overdueDays !== null) {
      out.push({
        icon: "mdi:clock-alert-outline",
        label: COPY.overdueRepurchase,
        hint: COPY.overdueHint(overdueDays),
        target: "orders",
        critical: true,
      });
    }
    return out;
  }, [openQuotes.data, pendingVehicles.data, unseenRecs.data, overdueDays]);

  return (
    <section className={cn("rounded-lg border border-primary/40 bg-primary/5 p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:flash-outline" size={16} className="text-primary" />
        {COPY.title}
      </h2>

      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:check-circle-outline" size={14} className="text-emerald-500" />
          {COPY.allClear}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => onNavigateTab(item.target)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-border hover:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Icon
                  icon={item.icon}
                  size={15}
                  className={cn(item.critical ? "text-rose-500" : "text-muted-foreground")}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
                {typeof item.count === "number" && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {item.count}
                  </span>
                )}
                {item.hint && (
                  <span className="text-[11px] text-muted-foreground">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
