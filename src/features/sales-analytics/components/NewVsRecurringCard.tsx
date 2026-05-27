import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { INewVsRecurringSnapshot } from "../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";

export interface INewVsRecurringCardProps {
  data: INewVsRecurringSnapshot;
}

export function NewVsRecurringCard({ data }: INewVsRecurringCardProps) {
  const recurringShare = 1 - data.newShare;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {S.customersNewVsRecurring}
        </h3>
        <Icon
          icon="mdi:account-multiple-plus-outline"
          size={20}
          className="text-muted-foreground"
        />
      </header>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {S.customersNewLabel}
            </span>
            <span className="font-mono text-muted-foreground">
              {data.newCustomers} cliente{data.newCustomers === 1 ? "" : "s"} ·{" "}
              {formatBRL(data.revenueFromNew)} ({formatPercent(data.newShare)})
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.round(data.newShare * 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium text-primary">{S.customersRecurringLabel}</span>
            <span className="font-mono text-muted-foreground">
              {data.recurringCustomers} cliente{data.recurringCustomers === 1 ? "" : "s"} ·{" "}
              {formatBRL(data.revenueFromRecurring)} ({formatPercent(recurringShare)})
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(recurringShare * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
