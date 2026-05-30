import { forwardRef } from "react";
import type { IVehicle } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServiceHistoryTimeline } from "./ServiceHistoryTimeline";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;

export interface IVehicleHistorySectionProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
}

/**
 * Long-content area below the bento. Tabs are scaffolded for future sections
 * (documents, costs); for now the single "Histórico completo" tab holds the
 * full service timeline.
 */
export const VehicleHistorySection = forwardRef<HTMLDivElement, IVehicleHistorySectionProps>(
  function VehicleHistorySection({ vehicle, canEdit, onAddService }, ref) {
    return (
      <div ref={ref} className="scroll-mt-6 rounded-lg border border-border bg-card p-4">
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">{COPY.fullTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="mt-4">
            <ServiceHistoryTimeline
              vehicle={vehicle}
              canEdit={canEdit}
              onAddService={onAddService}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  },
);
