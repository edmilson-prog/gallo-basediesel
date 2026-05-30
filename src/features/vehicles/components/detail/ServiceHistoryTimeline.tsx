import { useMemo } from "react";
import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/shared/utils/format";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
  /** When set, only the latest N entries render (summary mode). */
  limit?: number;
  /** Heading override (defaults to the section title). */
  title?: string;
  /** Shown as a "see all" button when the list is truncated by `limit`. */
  onSeeAll?: () => void;
}

export function ServiceHistoryTimeline({
  vehicle,
  canEdit,
  onAddService,
  limit,
  title,
  onSeeAll,
}: IServiceHistoryTimelineProps) {
  const sorted = useMemo<IVehicleServiceEntry[]>(
    () => [...vehicle.serviceHistory].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle.serviceHistory],
  );
  const visible = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  const truncated = typeof limit === "number" && sorted.length > limit;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title ?? SECTION_COPY.history}
      </h2>
      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-5 py-5">
          <ol aria-hidden="true" className="mb-4 space-y-3 border-l border-border pl-4">
            {[0, 1, 2].map((i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border border-border bg-muted/50" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-2/5 rounded bg-foreground/[0.06]" />
                  <div className="h-2.5 w-3/5 rounded bg-foreground/[0.03]" />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs text-muted-foreground">{COPY.emptyAutoHint}</p>
            {canEdit && onAddService && (
              <Button size="sm" onClick={onAddService}>
                <Icon icon="mdi:wrench" size={14} />
                {COPY.emptyCta}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {visible.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1 grid h-3 w-3 place-items-center rounded-full border border-border bg-primary" />
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatDateBR(entry.date)}
                    </span>
                    {entry.km !== undefined && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {entry.km.toLocaleString("pt-BR")} km
                      </span>
                    )}
                  </div>
                  {entry.parts.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.parts.map((p, i) => (
                        <Badge
                          key={`${entry.id}-${i}`}
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                        >
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {entry.orderId && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <Icon icon="mdi:link-variant" size={10} className="-mt-0.5 inline" />{" "}
                      {COPY.derivedFromOrder} {entry.orderId}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {truncated && onSeeAll && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onSeeAll}>
              {COPY.seeAll}
              <Icon icon="mdi:arrow-down" size={14} />
            </Button>
          )}
        </>
      )}
    </section>
  );
}
