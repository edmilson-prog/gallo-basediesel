import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  IRecommendation,
  RecommendationPriority,
  RecommendationType,
} from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useRecommendationsProvider } from "@/providers/data/hooks/useRecommendationsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";
import { CustomerEmptyState } from "../detail/CustomerEmptyState";

const COPY = CUSTOMER_STRINGS.recommendations;

/**
 * Only three recommendation kinds are surfaced on the MVP (PRD-012 spec). The
 * remaining types stay dormant in the mock generator and will switch on as
 * features (birthday → PRD-053, cross_sell → PRD-053+, etc.) become live.
 */
const MVP_TYPES: RecommendationType[] = ["recovery", "vehicle_maintenance", "follow_up"];

const PRIORITY_TONE: Record<RecommendationPriority, string> = {
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/40",
  high: "bg-severity-warning/15 text-severity-warning border-severity-warning/40",
  medium: "bg-severity-info/15 text-severity-info border-severity-info/40",
  low: "bg-muted text-muted-foreground border-border",
};

const TYPE_META: Record<RecommendationType, { icon: string }> = {
  recovery: { icon: "mdi:account-clock-outline" },
  vehicle_maintenance: { icon: "mdi:wrench-clock" },
  follow_up: { icon: "mdi:bell-ring-outline" },
  cross_sell: { icon: "mdi:cart-arrow-up" },
  up_sell: { icon: "mdi:trending-up" },
  equivalence: { icon: "mdi:swap-horizontal" },
  stock_alert: { icon: "mdi:package-variant" },
  birthday: { icon: "mdi:cake-variant-outline" },
  wallet_imbalance: { icon: "mdi:scale-balance" },
  positivacao_gap: { icon: "mdi:account-multiple-minus-outline" },
};

export interface IRecommendationsTabProps {
  customer: ICustomer;
  /** Drops the internal title — the detail page's `CustomerPanel` owns it. */
  headless?: boolean;
}

export function RecommendationsTab({ customer, headless }: IRecommendationsTabProps) {
  const provider = useRecommendationsProvider();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["customer-recommendations", customer.id] as const,
    staleTime: 30 * 1000,
    queryFn: () =>
      provider
        .list({
          subjectId: customer.id,
          resolved: false,
          type: MVP_TYPES,
          pageSize: 50,
        })
        .then((r) => r.data),
  });

  const items = query.data ?? [];

  const handleDismiss = async (rec: IRecommendation) => {
    try {
      await provider.resolve(rec.id);
      auditLog({
        action: "recommendation.dismissed",
        resource: "recommendation",
        resourceId: rec.id,
        before: { resolved: false },
        after: { resolved: true },
      });
      toast.success(COPY.dismissedToast);
      await queryClient.invalidateQueries({
        queryKey: ["customer-recommendations", customer.id],
      });
    } catch {
      toast.error("Não foi possível dispensar a recomendação.");
    }
  };

  return (
    <div className="space-y-3">
      {!headless && (
        <header className="flex items-center gap-2">
          <Icon icon="mdi:lightbulb-on-outline" size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
        </header>
      )}

      {query.isLoading ? (
        <TabSkeleton rows={3} rowHeight="h-20" />
      ) : items.length === 0 ? (
        headless ? (
          <CustomerEmptyState
            icon="mdi:lightbulb-off-outline"
            title={COPY.emptyTitle}
            text={COPY.emptyHint}
          />
        ) : (
          <TabEmptyState icon="mdi:lightbulb-off-outline" message={COPY.empty} />
        )
      ) : (
        <ul className="space-y-2">
          {items.map((rec) => {
            const meta = TYPE_META[rec.type];
            return (
              <li
                key={rec.id}
                className={cn(
                  "rounded-md border bg-background p-3",
                  PRIORITY_TONE[rec.priority].split(" ").pop(),
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      PRIORITY_TONE[rec.priority],
                    )}
                  >
                    <Icon icon={meta.icon} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rec.description}</p>
                    <span
                      className={cn(
                        "mt-1.5 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        PRIORITY_TONE[rec.priority],
                      )}
                    >
                      {COPY.priority[rec.priority]}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-[11px]"
                    onClick={() => handleDismiss(rec)}
                  >
                    <Icon icon="mdi:close" size={12} />
                    {COPY.dismiss}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
