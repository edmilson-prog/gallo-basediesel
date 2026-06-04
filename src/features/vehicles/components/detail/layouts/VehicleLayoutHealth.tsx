import { VehicleHealthCard } from "../VehicleHealthCard";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerCard } from "../VehicleOwnerCard";
import { OwnerFleetCard } from "../OwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { VehicleTechSpecs } from "../VehicleTechSpecs";
import { CompatibleParts } from "../compatible-parts/CompatibleParts";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

export function VehicleLayoutHealth({
  vehicle,
  now,
  canEdit,
  onAddService,
  onUpdated,
  onSeeFullHistory,
  onRequestLinkModel,
}: IVehicleLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <VehicleHealthCard vehicle={vehicle} className="lg:col-span-3" />
        <VehicleKmEvolutionCard vehicle={vehicle} now={now} className="lg:col-span-6" />
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-3">
          <MaintenanceRecommendations vehicle={vehicle} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-8">
          <ServiceHistoryTimeline
            vehicle={vehicle}
            canEdit={canEdit}
            onAddService={onAddService}
            limit={3}
            title={HISTORY_COPY.summaryTitle}
            onSeeAll={onSeeFullHistory}
          />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <VehicleOwnerCard customerId={vehicle.customerId} />
          </div>
          <OwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <MostReplacedPartsCard vehicle={vehicle} className="lg:col-span-6" />
        <div className="space-y-6 lg:col-span-6">
          <VehicleTechSpecs vehicle={vehicle} canEdit={canEdit} onUpdated={onUpdated} />
          <CompatibleParts vehicle={vehicle} canEdit={canEdit} onRequestLinkModel={onRequestLinkModel} />
        </div>
      </div>
    </div>
  );
}
