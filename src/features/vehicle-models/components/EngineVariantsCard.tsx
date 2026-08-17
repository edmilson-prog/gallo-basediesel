import type { ID, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KitStatusBadge } from "@/features/model-kits/components/KitStatusBadge";
import { formatYearRange } from "../utils/formatYearRange";

export interface IEngineVariantsCardProps {
  model: IVehicleModel;
  /** Canonical records sharing brand + model — the same truck to whoever curates kits. */
  siblings: IVehicleModel[];
  kitsBySibling: Map<ID, IVehicleModelKit[]>;
  /** Kits of the model on screen — the source of a sideways copy. */
  currentKits: IVehicleModelKit[];
  canManage: boolean;
  onOpen(sibling: IVehicleModel): void;
  onBuild(sibling: IVehicleModel): void;
  onCopy(kit: IVehicleModelKit, target: IVehicleModel): void;
}

/** Official kit first — that is the one worth copying sideways. */
function representativeKit(kits: IVehicleModelKit[]): IVehicleModelKit | undefined {
  return kits.find((k) => k.status === "oficial") ?? kits[0];
}

/**
 * `FH 460 D13K460` and `FH 460 D13K500` are distinct canonical records but the
 * same truck at the counter. This strip keeps the siblings one click away and
 * turns the recurring case — one has a kit, the other does not — into a copy.
 */
export function EngineVariantsCard({
  model,
  siblings,
  kitsBySibling,
  currentKits,
  canManage,
  onOpen,
  onBuild,
  onCopy,
}: IEngineVariantsCardProps) {
  if (siblings.length === 0) return null;

  const sourceKit = representativeKit(currentKits);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon icon="mdi:engine-outline" size={14} className="text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Outros motores do {model.model}
        </span>
      </header>

      {siblings.map((sibling) => {
        const kit = representativeKit(kitsBySibling.get(sibling.id) ?? []);
        const years = formatYearRange(sibling.yearStart, sibling.yearEnd);

        return (
          <div
            key={sibling.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 first-of-type:border-t-0"
          >
            <button
              type="button"
              onClick={() => onOpen(sibling)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Icon icon="mdi:engine-outline" size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground hover:underline">
                {sibling.engine}
              </span>
              {years && <span className="text-xs tabular-nums text-muted-foreground">{years}</span>}
              {sibling.status === "inativo" && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Inativo
                </Badge>
              )}
            </button>

            {kit ? (
              <span className="flex items-center gap-2">
                <KitStatusBadge status={kit.status} />
                <span className="text-xs text-muted-foreground">
                  {kit.items.length} {kit.items.length === 1 ? "peça" : "peças"}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">sem kit</span>
                {canManage &&
                  (sourceKit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => onCopy(sourceKit, sibling)}
                    >
                      <Icon icon="mdi:content-copy" size={14} />
                      Copiar este kit para o {sibling.engine}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => onBuild(sibling)}
                    >
                      <Icon icon="mdi:plus" size={14} />
                      Montar
                    </Button>
                  ))}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
