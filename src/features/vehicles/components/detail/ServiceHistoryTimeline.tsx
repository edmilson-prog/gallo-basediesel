import { useMemo, useState } from "react";
import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/shared/utils/format";
import { VehicleInvite } from "../VehicleInvite";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;
const INVITE_COPY = VEHICLE_STRINGS.detail.invites;

export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
  /** When set, only the latest N entries render (summary mode). */
  limit?: number;
  /** Heading override (defaults to the section title). */
  title?: string;
  /** Hide the heading entirely — the card around it already carries one. */
  hideHeading?: boolean;
  /**
   * Expand the remaining entries in place instead of pointing at a separate
   * "histórico completo" section. This is what lets one timeline replace the
   * recent/complete pair.
   */
  expandable?: boolean;
  /** Shown as a "see all" button when the list is truncated by `limit`. */
  onSeeAll?: () => void;
}

export function ServiceHistoryTimeline({
  vehicle,
  canEdit,
  onAddService,
  limit,
  title,
  hideHeading = false,
  expandable = false,
  onSeeAll,
}: IServiceHistoryTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo<IVehicleServiceEntry[]>(
    () => [...vehicle.serviceHistory].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle.serviceHistory],
  );
  const capped = typeof limit === "number" && !(expandable && showAll);
  const visible = capped ? sorted.slice(0, limit) : sorted;
  const truncated = capped && sorted.length > (limit as number);

  return (
    <section className="space-y-3">
      {!hideHeading && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title ?? SECTION_COPY.history}
        </h2>
      )}
      {sorted.length === 0 ? (
        <VehicleInvite
          icon="mdi:history"
          title={INVITE_COPY.historyTitle}
          description={INVITE_COPY.historyDescription}
          action={
            canEdit && onAddService
              ? { icon: "mdi:wrench", label: INVITE_COPY.historyCta, onClick: onAddService }
              : undefined
          }
        />
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
          {expandable
            ? (truncated || showAll) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowAll((s) => !s)}
                >
                  {showAll ? COPY.showLess : COPY.showAll(sorted.length)}
                  <Icon icon={showAll ? "mdi:chevron-up" : "mdi:chevron-down"} size={14} />
                </Button>
              )
            : truncated &&
              onSeeAll && (
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
