import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";
import type { SellerAvailability } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS } from "../i18n/pt-BR";
import type { ISellerLoadEntry } from "../hooks/useSellerLoad";

export interface ISellerLoadListProps {
  entries: ISellerLoadEntry[];
  /** Used to scale the bar width — defaults to max(entries.activeCount). */
  overloadThreshold: number;
  isLoading: boolean;
  onSellerClick?: (sellerId: string) => void;
}

const AVAILABILITY_LABEL: Record<SellerAvailability, string> = {
  online: SERVICE_VOLUME_STRINGS.sellerLoadAvailabilityOnline,
  ausente: SERVICE_VOLUME_STRINGS.sellerLoadAvailabilityAusente,
  ocupado: SERVICE_VOLUME_STRINGS.sellerLoadAvailabilityOcupado,
  offline: SERVICE_VOLUME_STRINGS.sellerLoadAvailabilityOffline,
};

const AVAILABILITY_DOT: Record<SellerAvailability, string> = {
  online: "bg-severity-success",
  ausente: "bg-severity-warning",
  ocupado: "bg-severity-critical",
  offline: "bg-muted-foreground/40",
};

const BAND_FILL: Record<ISellerLoadEntry["band"], string> = {
  normal: "bg-severity-success",
  warning: "bg-severity-warning",
  critical: "bg-severity-critical",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SellerLoadList({
  entries,
  overloadThreshold,
  isLoading,
  onSellerClick,
}: ISellerLoadListProps) {
  const maxLoad = Math.max(overloadThreshold, ...entries.map((e) => e.activeCount), 1);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
            {SERVICE_VOLUME_STRINGS.sellerLoadTitle}
            <InfoHint
              text={SERVICE_VOLUME_STRINGS.sellerLoadHelp}
              label={SERVICE_VOLUME_STRINGS.sellerLoadTitle}
            />
          </h2>
          <p className="text-xs text-muted-foreground">
            {SERVICE_VOLUME_STRINGS.sellerLoadSubtitle}
          </p>
        </div>
        <Icon icon="mdi:account-multiple-outline" size={20} className="text-muted-foreground" />
      </header>

      <div className="flex flex-1 flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {SERVICE_VOLUME_STRINGS.sellerLoadEmpty}
          </p>
        ) : (
          entries.map(({ seller, activeCount, band }) => {
            const widthPct = Math.min(100, Math.round((activeCount / maxLoad) * 100));
            const initials = getInitials(seller.fullName);
            const interactive = Boolean(onSellerClick);
            return (
              <button
                key={seller.id}
                type="button"
                onClick={() => onSellerClick?.(seller.id)}
                disabled={!interactive}
                className={cn(
                  "group flex items-center gap-3 rounded-md p-2 text-left",
                  interactive &&
                    "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !interactive && "cursor-default",
                )}
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                      AVAILABILITY_DOT[seller.availability],
                    )}
                    aria-label={AVAILABILITY_LABEL[seller.availability]}
                    title={AVAILABILITY_LABEL[seller.availability]}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">{seller.fullName}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        band === "critical" && "text-severity-critical",
                        band === "warning" && "text-severity-warning",
                        band === "normal" && "text-muted-foreground",
                      )}
                    >
                      {SERVICE_VOLUME_STRINGS.sellerLoadCount(activeCount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full transition-all", BAND_FILL[band])}
                      style={{ width: `${widthPct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
