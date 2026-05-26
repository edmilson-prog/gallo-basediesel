import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
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
            return (
              <li
                key={rec.rule.key}
                className={cn(
                  "rounded-md border bg-card px-3 py-3",
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
                      // PRD-031 ainda não implementado — placeholder.
                      toast.info(
                        "Quando o módulo de orçamentos (PRD-031) estiver pronto, o atalho criará um orçamento com as peças sugeridas.",
                      );
                      void navigate({ to: "/app/orcamentos" });
                    }}
                  >
                    <Icon icon="mdi:file-document-plus-outline" size={12} />
                    {COPY.createQuote}
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
