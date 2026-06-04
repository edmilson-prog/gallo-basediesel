import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicle } from "@/shared/types";
import { recordAuditLogSync, useVehiclesProvider } from "@/providers/data";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export interface IUseLinkVehicleModel {
  linking: boolean;
  link: (vehicleId: ID, modelId: ID) => Promise<IVehicle>;
}

/** Link a vehicle to a canonical model (PRD-016) with audit + cache invalidation. */
export function useLinkVehicleModel(): IUseLinkVehicleModel {
  const provider = useVehiclesProvider();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);

  const link = useCallback(
    async (vehicleId: ID, modelId: ID) => {
      setLinking(true);
      try {
        const before = await provider.get(vehicleId);
        const updated = await provider.update(vehicleId, { modelId });
        void queryClient.invalidateQueries({ queryKey: ["vehicles-list"] });
        void queryClient.invalidateQueries({ queryKey: ["vehicle-detail", vehicleId] });
        const user = readCurrentUserSync();
        recordAuditLogSync({
          actorId: user?.id ?? "mock-user",
          action: "link_model",
          resource: "vehicle",
          resourceId: vehicleId,
          before,
          after: updated,
        });
        toast.success(VEHICLE_STRINGS.detail.linkModel.linkedToast);
        return updated;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao vincular modelo.");
        throw err;
      } finally {
        setLinking(false);
      }
    },
    [provider, queryClient],
  );

  return { linking, link };
}
