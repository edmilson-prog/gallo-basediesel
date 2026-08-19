import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import { computeRecommendations } from "../../utils/maintenanceRules";
import { VehicleInvite } from "../VehicleInvite";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.recommendations;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;
const INVITE_COPY = VEHICLE_STRINGS.detail.invites;
const HEALTH_COPY = VEHICLE_STRINGS.detail.health;

export interface IMaintenanceRecommendationsProps {
  vehicle: IVehicle;
  /** Opens the km modal — offered when there is no odometer to measure against. */
  onUpdateKm?: () => void;
  onAddService?: () => void;
  /** Stack the cards in one column — for the narrow "Próximas ações" slot. */
  compact?: boolean;
  /** The caller already labelled the block (e.g. "Próximas ações"). */
  hideHeading?: boolean;
}

export function MaintenanceRecommendations({
  vehicle,
  onUpdateKm,
  onAddService,
  compact = false,
  hideHeading = false,
}: IMaintenanceRecommendationsProps) {
  const navigate = useNavigate();
  const recommendations = useMemo(() => computeRecommendations(vehicle), [vehicle]);
  const hasKm = typeof vehicle.currentKm === "number";

  // Resolve applicable filter kit for this vehicle (RF-014).
  const modelKitsQuery = useModelKits({});
  const kits = modelKitsQuery.data ?? [];
  const applicableFilterKit = useMemo(
    () =>
      findKitsForVehicle(vehicle, kits).find(
        (k) => k.status === "oficial" && k.category === "filtros",
      ) ?? null,
    [vehicle, kits],
  );

  return (
    <section className="space-y-3">
      {!hideHeading && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {SECTION_COPY.recommendations}
        </h2>
      )}

      {!hasKm ? (
        // No odometer, no ruler: saying "nenhuma recomendação" here would read
        // as "nothing to do", when the truth is "nothing can be computed yet".
        <VehicleInvite
          compact
          icon="mdi:wrench-outline"
          title={INVITE_COPY.recsTitle}
          description={INVITE_COPY.recsDescription}
          action={
            onUpdateKm
              ? { icon: "mdi:counter", label: HEALTH_COPY.unknownCta, onClick: onUpdateKm }
              : undefined
          }
          secondary={
            onAddService
              ? { label: VEHICLE_STRINGS.detail.addService, onClick: onAddService }
              : undefined
          }
        />
      ) : recommendations.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-md border border-dashed border-border bg-muted/20 px-4 py-3">
          <Icon icon="mdi:check-circle-outline" size={18} className="text-severity-success" />
          <p className="text-xs text-muted-foreground">{COPY.empty}</p>
        </div>
      ) : (
        <ul className={cn("grid gap-2", !compact && "md:grid-cols-2")}>
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
                    : "border-severity-warning/30 bg-severity-warning/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon
                    icon={isOverdue ? "mdi:alert-octagon" : "mdi:alert-circle-outline"}
                    size={18}
                    className={cn(
                      "shrink-0",
                      isOverdue ? "text-destructive" : "text-severity-warning",
                    )}
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
