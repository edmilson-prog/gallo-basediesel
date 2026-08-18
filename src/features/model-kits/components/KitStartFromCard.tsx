import type { IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IStartFromCandidate } from "../engine";
import { KitStatusBadge } from "./KitStatusBadge";

export interface IKitStartFromCardProps {
  candidates: IStartFromCandidate<IVehicleModelKit, IVehicleModel>[];
  onUse: (kit: IVehicleModelKit) => void;
}

/**
 * Kits already curated for a similar engine, offered as a starting point. Only
 * rendered while the composition is empty — after that it would overwrite work.
 * Each row states how much of the kit actually reaches this engine, so the
 * curator knows what still needs checking.
 */
export function KitStartFromCard({ candidates, onUse }: IKitStartFromCardProps) {
  if (candidates.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <header className="flex flex-wrap items-center gap-2">
        <Icon icon="mdi:content-copy" size={15} className="text-severity-warning" />
        <span className="text-sm font-semibold text-foreground">Começar de um kit parecido</span>
        <span className="text-xs text-muted-foreground">
          traz as peças e as quantidades; você ajusta o que muda
        </span>
      </header>

      <div className="mt-2 flex flex-col">
        {candidates.map(({ kit, model, isSibling, fit }) => {
          const notListed = kit.items.length - fit;
          return (
            <div
              key={kit.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {model.model} {model.engine}
                  </span>
                  {isSibling && (
                    <Badge
                      variant="outline"
                      className="border-severity-warning/40 text-[10px] text-severity-warning"
                    >
                      mesmo modelo
                    </Badge>
                  )}
                  <KitStatusBadge status={kit.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {kit.items.length} {kit.items.length === 1 ? "peça" : "peças"} · {fit}{" "}
                  {fit === 1 ? "serve" : "servem"} neste motor
                  {notListed > 0 &&
                    ` · ${notListed} não ${notListed === 1 ? "listada" : "listadas"}`}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => onUse(kit)}
              >
                Usar como base
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
