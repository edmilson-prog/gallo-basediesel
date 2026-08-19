import { Icon } from "@/components/Icon";
import { VehicleFactsStrip } from "../VehicleFactsStrip";
import { VehicleHealthBlock } from "../VehicleHealthBlock";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerFleetCard } from "../VehicleOwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { CompatibleParts } from "../compatible-parts/CompatibleParts";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const SITUATION_COPY = VEHICLE_STRINGS.detail.situation;
const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

const HISTORY_PREVIEW = 4;

/**
 * A · Prontuário — the record is the protagonist.
 *
 * Reads top to bottom: what the vehicle *is* (facts strip), what it *needs*
 * (health ring beside the next actions), how it has been *used* (km curve),
 * and what has been *done* to it (one timeline, not a recent/complete pair).
 * The rail holds context that supports those answers without competing with
 * them: the owner and their fleet, the parts that fit, the parts that keep
 * coming back.
 */
export function VehicleLayoutProntuario({
  vehicle,
  now,
  canEdit,
  onAddService,
  onRequestLinkModel,
  onUpdateKm,
  onEdit,
}: IVehicleLayoutProps) {
  const historyCount = vehicle.serviceHistory.length;

  return (
    <div className="space-y-4">
      <VehicleFactsStrip
        vehicle={vehicle}
        now={now}
        canEdit={canEdit}
        onUpdateKm={onUpdateKm}
        onRequestLinkModel={onRequestLinkModel}
        onEdit={onEdit}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <Icon icon="mdi:heart-pulse" size={15} className="text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {SITUATION_COPY.title}
              </h2>
            </header>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4 p-4">
              <VehicleHealthBlock vehicle={vehicle} onUpdateKm={canEdit ? onUpdateKm : undefined} />
              <div className="min-w-0 flex-1 basis-[320px]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {SITUATION_COPY.nextActions}
                </p>
                <MaintenanceRecommendations
                  hideHeading
                  compact
                  vehicle={vehicle}
                  onUpdateKm={canEdit ? onUpdateKm : undefined}
                  onAddService={canEdit ? onAddService : undefined}
                />
              </div>
            </div>
          </section>

          <VehicleKmEvolutionCard
            vehicle={vehicle}
            now={now}
            onUpdateKm={canEdit ? onUpdateKm : undefined}
          />

          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <Icon icon="mdi:history" size={15} className="text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {historyCount > 0 ? HISTORY_COPY.titleWithCount(historyCount) : HISTORY_COPY.title}
              </h2>
              {historyCount > 0 && canEdit && (
                <button
                  type="button"
                  onClick={onAddService}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:underline"
                >
                  <Icon icon="mdi:wrench" size={12} />
                  {HISTORY_COPY.register}
                </button>
              )}
            </header>
            <div className="p-4">
              <ServiceHistoryTimeline
                hideHeading
                expandable
                limit={HISTORY_PREVIEW}
                vehicle={vehicle}
                canEdit={canEdit}
                onAddService={onAddService}
              />
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <VehicleOwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
          <div className="rounded-lg border border-border bg-card p-4">
            <CompatibleParts
              vehicle={vehicle}
              canEdit={canEdit}
              onRequestLinkModel={onRequestLinkModel}
            />
          </div>
          <MostReplacedPartsCard
            vehicle={vehicle}
            onAddService={canEdit ? onAddService : undefined}
          />
        </div>
      </div>
    </div>
  );
}
