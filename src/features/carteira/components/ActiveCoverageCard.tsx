import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { SellerRoute } from "./SellerRoute";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { coverageProgress } from "../engine/coverageProgress";
import { formatDate, formatDateTime } from "../utils/formatters";

export interface IActiveCoverageCardProps {
  transfer: ICarteiraTransfer;
  sellersById: Map<ID, ISeller>;
  canRevert: boolean;
  onRevert: (transfer: ICarteiraTransfer) => void;
  onViewCustomers: (transfer: ICarteiraTransfer) => void;
}

/**
 * A coverage in force — the only thing on this page that needs attention rather
 * than review. It carries a clock, a progress bar and the date the customers
 * come back on their own, which is exactly what separates it from the permanent
 * changes listed below.
 */
export function ActiveCoverageCard({
  transfer,
  sellersById,
  canRevert,
  onRevert,
  onViewCustomers,
}: IActiveCoverageCardProps) {
  const strings = CARTEIRA_STRINGS.coverage;
  const { daysLeft, elapsed, isOver } = coverageProgress(transfer.startDate, transfer.endDate);
  const createdBy = sellersById.get(transfer.createdBy)?.fullName ?? "—";
  const count = transfer.customerIds.length;

  const facts: { label: string; value: string }[] = [
    { label: strings.autoRevert, value: formatDateTime(transfer.autoRevertAt) },
    { label: strings.registeredBy, value: `${createdBy} · ${formatDate(transfer.createdAt)}` },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-severity-warning/35 bg-card">
      <div className="flex flex-wrap items-center gap-3.5 px-4 py-3">
        <Badge
          variant="outline"
          className="gap-1.5 border-severity-warning/40 bg-severity-warning/10 text-[10px] uppercase tracking-wide text-severity-warning"
        >
          <Icon icon="mdi:clock-outline" size={12} />
          {CARTEIRA_STRINGS.type.temporary}
          {transfer.reason ? ` · ${transfer.reason}` : ""}
        </Badge>

        <SellerRoute
          fromSellerId={transfer.fromSellerId}
          toSellerId={transfer.toSellerId}
          sellersById={sellersById}
        />

        <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground/70">
          <Icon icon="mdi:account-multiple-outline" size={14} className="text-muted-foreground" />
          {CARTEIRA_STRINGS.active.viewCustomers(count)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onViewCustomers(transfer)}
          >
            {strings.viewCustomers}
          </Button>
          {canRevert && (
            <Button type="button" variant="secondary" size="sm" onClick={() => onRevert(transfer)}>
              <Icon icon="mdi:undo" size={14} />
              {strings.returnNow}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-4 pb-3.5">
        <div className="min-w-[13rem] flex-[1_1_16rem]">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[12.5px] font-bold text-severity-warning">
              {isOver ? strings.endingToday : strings.daysLeft(daysLeft)}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {formatDate(transfer.startDate)} → {formatDate(transfer.endDate)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-severity-warning"
              style={{ width: `${Math.round(elapsed * 100)}%` }}
            />
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-[12.5px] text-foreground/70">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
