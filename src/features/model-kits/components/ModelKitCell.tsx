import { useMemo } from "react";
import type { ID, IPart, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { buildKitPreview } from "../utils/kitPreview";
import { computeKitTotals, pickRepresentativeKit } from "../engine";
import { KitStatusBadge } from "./KitStatusBadge";

export interface IModelKitCellProps {
  /** Kits of this model, already in curation order. */
  kits: IVehicleModelKit[];
  partsById: Map<ID, IPart>;
  /** Catalog parts reaching this model — what a kit could be curated from. */
  compatibleCount: number;
  applicationCounts: Record<ID, number>;
  /** While false, a kit is not "ainda não aplicado" — the count is still loading. */
  applicationsReady: boolean;
  canBuild: boolean;
  onOpen: () => void;
  onBuild: () => void;
}

/**
 * What a model row says about its kit. The old list spent this space on a grey
 * `Kits 0` pill; here the row carries the curation itself — status, size, what
 * the kit costs, how often it reached a quote and when it was last looked at.
 * A model with no kit states the pool it could be built from and offers the
 * action on the row, because that is the work this screen exists for.
 */
export function ModelKitCell({
  kits,
  partsById,
  compatibleCount,
  applicationCounts,
  applicationsReady,
  canBuild,
  onOpen,
  onBuild,
}: IModelKitCellProps) {
  const kit = pickRepresentativeKit(kits);

  const totals = useMemo(() => {
    if (!kit) return null;
    return computeKitTotals(buildKitPreview(kit, partsById).lines);
  }, [kit, partsById]);

  if (!kit || !totals) {
    return (
      <div className="flex items-center justify-end gap-3">
        <span className="text-right">
          <span className="block text-sm font-medium text-muted-foreground">Sem kit</span>
          <span className="block text-xs text-muted-foreground/80">
            {compatibleCount} {compatibleCount === 1 ? "peça compatível" : "peças compatíveis"} no
            catálogo
          </span>
        </span>
        {canBuild && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={onBuild}
          >
            <Icon icon="mdi:plus" size={14} />
            Montar kit
          </Button>
        )}
      </div>
    );
  }

  const applied = applicationCounts[kit.id] ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-md px-1.5 py-1 text-right transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <KitStatusBadge status={kit.status} />
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {totals.baseCount} {totals.baseCount === 1 ? "peça" : "peças"}
          {totals.optionalCount > 0 && ` + ${totals.optionalCount} opc.`}
        </span>
        <span className="min-w-[5.5rem] text-sm font-semibold tabular-nums text-foreground">
          {formatBRL(totals.base)}
        </span>
      </span>

      <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 text-xs text-muted-foreground">
        {kits.length > 1 && <span>{kits.length} kits ·</span>}
        {applicationsReady && (
          <span>{applied > 0 ? `aplicado ${applied}× em orçamentos` : "ainda não aplicado"}</span>
        )}
        <span>· {formatDateBR(kit.updatedAt)}</span>
        {totals.outOfStockCount > 0 && (
          <span className="inline-flex items-center gap-1 text-severity-critical">
            <Icon icon="mdi:alert-outline" size={12} />
            peça sem estoque
          </span>
        )}
      </span>
    </button>
  );
}
