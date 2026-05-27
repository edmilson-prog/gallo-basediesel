import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRLCompact, formatPercent } from "@/shared/utils/format";
import type { ABCClass } from "@/shared/types";
import type { IABCClassBucket } from "../engine/classifyABC";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

export interface IABCKpisProps {
  totalCustomers: number;
  totalRevenue: number;
  byClass: { A: IABCClassBucket; B: IABCClassBucket; C: IABCClassBucket };
  isLoading?: boolean;
  onClassClick?: (klass: ABCClass) => void;
}

const CLASS_BADGE: Record<ABCClass, { label: string; bg: string; fg: string }> = {
  A: {
    label: S.kpiClassA,
    bg: "bg-emerald-500/10",
    fg: "text-emerald-600 dark:text-emerald-300",
  },
  B: {
    label: S.kpiClassB,
    bg: "bg-amber-500/10",
    fg: "text-amber-600 dark:text-amber-300",
  },
  C: {
    label: S.kpiClassC,
    bg: "bg-orange-500/10",
    fg: "text-orange-600 dark:text-orange-300",
  },
};

interface IClassCardProps {
  klass: ABCClass;
  bucket: IABCClassBucket;
  isLoading?: boolean;
  onClick?: () => void;
}

function ClassCard({ klass, bucket, isLoading, onClick }: IClassCardProps) {
  const meta = CLASS_BADGE[klass];
  const interactive = Boolean(onClick);
  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-2 p-4",
        interactive && "cursor-pointer transition-colors hover:border-primary/50 hover:shadow-md",
      )}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold",
              meta.bg,
              meta.fg,
            )}
            aria-hidden="true"
          >
            {klass}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{meta.label}</span>
            <span className="text-xs text-muted-foreground">{S.kpiClassHelp(klass)}</span>
          </div>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {bucket.count.toLocaleString("pt-BR")}
        </span>
      )}
      <p className="text-xs text-muted-foreground">
        {formatBRLCompact(bucket.revenue)} ·{" "}
        <span className="font-medium text-foreground">{formatPercent(bucket.revenuePct)}</span>{" "}
        {S.kpiClassRevenue}
      </p>
    </Card>
  );
}

export function ABCKpis({
  totalCustomers,
  totalRevenue,
  byClass,
  isLoading,
  onClassClick,
}: IABCKpisProps) {
  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Distribuição ABC"
    >
      <Card className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:account-multiple-outline" size={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{S.kpiTotalClassified}</span>
            <span className="text-xs text-muted-foreground">no período</span>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {totalCustomers.toLocaleString("pt-BR")}
          </span>
        )}
      </Card>
      <Card className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:cash-multiple" size={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{S.kpiTotalRevenue}</span>
            <span className="text-xs text-muted-foreground">soma de pedidos pagos</span>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatBRLCompact(totalRevenue)}
          </span>
        )}
      </Card>
      <ClassCard
        klass="A"
        bucket={byClass.A}
        isLoading={isLoading}
        onClick={onClassClick ? () => onClassClick("A") : undefined}
      />
      <ClassCard
        klass="B"
        bucket={byClass.B}
        isLoading={isLoading}
        onClick={onClassClick ? () => onClassClick("B") : undefined}
      />
      <ClassCard
        klass="C"
        bucket={byClass.C}
        isLoading={isLoading}
        onClick={onClassClick ? () => onClassClick("C") : undefined}
      />
    </section>
  );
}
