import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import { computeRecommendations } from "../../utils/maintenanceRules";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.recommendations;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

export interface IMaintenanceRecommendationsProps {
  vehicle: IVehicle;
}

export function MaintenanceRecommendations({ vehicle }: IMaintenanceRecommendationsProps) {
  const navigate = useNavigate();
  const recommendations = useMemo(() => computeRecommendations(vehicle), [vehicle]);

  // Resolve applicable filter kit for this vehicle (RF-014).
  const modelKitsQuery = useModelKits({});
  const vehicleModelsQuery = useVehicleModels({});
  const kits = modelKitsQuery.data ?? [];
  const vehicleModels = vehicleModelsQuery.data ?? [];
  const modelsById = useMemo(() => new Map(vehicleModels.map((m) => [m.id, m])), [vehicleModels]);
  const applicableFilterKit = useMemo(
    () =>
      findKitsForVehicle(vehicle, kits, modelsById).find(
        (k) => k.status === "oficial" && k.category === "filtros",
      ) ?? null,
    [vehicle, kits, modelsById],
  );

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {SECTION_COPY.recommendations}
      </h2>
      {recommendations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <Icon icon="mdi:check-circle-outline" size={20} className="text-emerald-500" />
          <p className="text-xs text-muted-foreground">{COPY.empty}</p>
        </div>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {recommendations.map((rec) => {
            const isOverdue = rec.remainingKm <= 0;
            const isFilterCard = rec.rule.key === "filters";
            const hasKit = isFilterCard && applicableFilterKit !== null;
            return (
              <li
                key={rec.rule.key}
                className={cn(
                  "rounded-md border bg-card px-4 py-3",
                  isOverdue
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-amber-500/30 bg-amber-500/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon
                    icon={isOverdue ? "mdi:alert-octagon" : "mdi:alert-circle-outline"}
                    size={18}
                    className={
                      isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-300"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{rec.rule.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {COPY.due(rec.remainingKm)}
                    </p>
                    {rec.lastServiceKm !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        Última troca registrada: {rec.lastServiceKm.toLocaleString("pt-BR")} km
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      if (hasKit) {
                        void navigate({
                          to: "/app/orcamentos/novo",
                          search: { applyKitId: applicableFilterKit!.id },
                        });
                      } else {
                        void navigate({ to: "/app/orcamentos/novo" });
                      }
                    }}
                  >
                    <Icon icon="mdi:file-document-plus-outline" size={12} />
                    {hasKit ? "Criar orçamento com Kit" : COPY.createQuote}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
