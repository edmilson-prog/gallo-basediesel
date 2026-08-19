import { useState, type ReactNode } from "react";
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince, formatDateBR } from "@/shared/utils/format";
import { useVehicleModel } from "@/features/vehicle-models/hooks/useVehicleModel";
import { formatKm, maskVin } from "../../utils/vehicleDisplay";
import { usagePerYear } from "../../utils/kmSeries";
import { lastServiceEntry } from "../../utils/vehicleKpis";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.facts;

export interface IVehicleFactsStripProps {
  vehicle: IVehicle;
  now?: Date;
  canEdit: boolean;
  onUpdateKm: () => void;
  onRequestLinkModel: () => void;
  /** Opens the vehicle form — where engine and VIN are actually edited. */
  onEdit: () => void;
  className?: string;
}

/**
 * One strip of technical facts, replacing `VehicleStatStrip` + `VehicleTechSpecs`.
 *
 * Those two cards both showed the odometer, so the same number appeared twice
 * on one screen; and between them they spent five cells restating what the
 * maintenance band already says. What survives is the six facts that identify
 * and date the vehicle — each one carrying, when blank, the action that fills
 * it rather than a dash.
 */
export function VehicleFactsStrip({
  vehicle,
  now = new Date(),
  canEdit,
  onUpdateKm,
  onRequestLinkModel,
  onEdit,
  className,
}: IVehicleFactsStripProps) {
  const [revealVin, setRevealVin] = useState(false);
  const modelQuery = useVehicleModel(vehicle.modelId ?? undefined);
  const model = modelQuery.data;

  const usage = usagePerYear(vehicle, now);
  const last = lastServiceEntry(vehicle);
  const lastDays = last ? daysSince(last.date, now) : null;

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      <FactCell label={COPY.currentKm}>
        {typeof vehicle.currentKm === "number" ? (
          <>
            <span className="tabular-nums">{formatKm(vehicle.currentKm)}</span>
            {canEdit && (
              <InlineAction icon="mdi:pencil" muted onClick={onUpdateKm}>
                {COPY.updateKm}
              </InlineAction>
            )}
          </>
        ) : canEdit ? (
          <InlineAction icon="mdi:plus" onClick={onUpdateKm}>
            {COPY.informKm}
          </InlineAction>
        ) : (
          <Empty />
        )}
      </FactCell>

      <FactCell label={COPY.engine}>
        {vehicle.engine ? (
          vehicle.engine
        ) : canEdit ? (
          <InlineAction icon="mdi:plus" onClick={onEdit} title={COPY.engineHint}>
            {COPY.informEngine}
          </InlineAction>
        ) : (
          <Empty />
        )}
      </FactCell>

      <FactCell label={COPY.vin}>
        {vehicle.vin ? (
          <>
            <span className="font-mono">{revealVin ? vehicle.vin : maskVin(vehicle.vin)}</span>
            <InlineAction muted onClick={() => setRevealVin((v) => !v)}>
              {revealVin ? COPY.hide : COPY.reveal}
            </InlineAction>
          </>
        ) : (
          <Empty />
        )}
      </FactCell>

      <FactCell label={COPY.model}>
        {vehicle.modelId != null ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon
              icon="mdi:link-variant"
              size={13}
              className="shrink-0 text-severity-success"
              aria-hidden
            />
            <span className="truncate">
              {model ? `${model.brand} ${model.model} (${model.engine})` : "…"}
            </span>
          </span>
        ) : canEdit ? (
          <InlineAction icon="mdi:link-variant" onClick={onRequestLinkModel}>
            {COPY.linkModel}
          </InlineAction>
        ) : (
          <Empty />
        )}
      </FactCell>

      <FactCell label={COPY.usage}>
        {usage === null ? (
          <Empty />
        ) : (
          <span className="tabular-nums">{COPY.usageValue(usage)}</span>
        )}
      </FactCell>

      <FactCell label={COPY.lastVisit}>
        {last && lastDays !== null ? (
          COPY.lastVisitValue(formatDateBR(last.date), lastDays)
        ) : (
          <span className="text-muted-foreground">{COPY.noVisits}</span>
        )}
      </FactCell>
    </dl>
  );
}

function FactCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex min-h-[20px] flex-wrap items-center gap-2 text-sm font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground">{COPY.empty}</span>;
}

interface IInlineActionProps {
  children: ReactNode;
  onClick: () => void;
  icon?: string;
  /** Secondary treatment for actions next to a value that is already filled. */
  muted?: boolean;
  title?: string;
}

function InlineAction({ children, onClick, icon, muted = false, title }: IInlineActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold hover:underline",
        muted ? "text-muted-foreground" : "text-primary",
      )}
    >
      {icon && <Icon icon={icon} size={12} />}
      {children}
    </button>
  );
}
