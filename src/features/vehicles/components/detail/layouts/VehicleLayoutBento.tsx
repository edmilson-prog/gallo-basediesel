import { VehicleHealthCard } from "../VehicleHealthCard";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerCard } from "../VehicleOwnerCard";
import { OwnerFleetCard } from "../OwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { VehicleTechSpecs } from "../VehicleTechSpecs";
import { CompatiblePartsPlaceholder } from "../CompatiblePartsPlaceholder";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

export function VehicleLayoutBento({
  vehicle,
  now,
  canEdit,
  onAddService,
  onUpdated,
  onSeeFullHistory,
}: IVehicleLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <VehicleHealthCard vehicle={vehicle} />
      <VehicleKmEvolutionCard vehicle={vehicle} now={now} className="md:col-span-2" />
      <div className="rounded-lg border border-border bg-card p-4">
        <MaintenanceRecommendations vehicle={vehicle} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <ServiceHistoryTimeline
          vehicle={vehicle}
          canEdit={canEdit}
          onAddService={onAddService}
          limit={3}
          title={HISTORY_COPY.summaryTitle}
          onSeeAll={onSeeFullHistory}
        />
      </div>
      <MostReplacedPartsCard vehicle={vehicle} className="md:col-span-2" />

      <div className="rounded-lg border border-border bg-card p-4">
        <VehicleOwnerCard customerId={vehicle.customerId} />
      </div>
      <OwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <VehicleTechSpecs vehicle={vehicle} canEdit={canEdit} onUpdated={onUpdated} />
      </div>
      <CompatiblePartsPlaceholder vehicle={vehicle} className="md:col-span-2" />
    </div>
  );
}
