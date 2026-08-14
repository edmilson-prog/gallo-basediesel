import { useMemo } from "react";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { buildKitPreview } from "../utils/kitPreview";
import { KIT_CATEGORY_CONFIG, KIT_FAMILIES, computeKitTotals, getFamilyCoverage } from "../engine";
import { KitCategoryBadge } from "./KitCategoryBadge";
import { KitStatusBadge } from "./KitStatusBadge";
import { KitPartLine } from "./KitPartLine";

export interface IModelKitCardProps {
  kit: IVehicleModelKit;
  partsById: Map<ID, IPart>;
  canManage: boolean;
  /** Quotes that applied this kit. `undefined` while the count is still loading. */
  appliedCount?: number;
  /** Sibling engines with no kit of their own — offered as copy destinations. */
  copyTargets?: IVehicleModel[];
  onEdit(): void;
  onApply(): void;
  onPromote(): void;
  onDemote(): void;
  onDelete(): void;
  onCopyTo?(target: IVehicleModel): void;
}

/** "óleo e de combustível" — the families a category expects but the kit lacks. */
function familyList(labels: string[]): string {
  return labels.join(" e de ");
}

export function ModelKitCard({
  kit,
  partsById,
  canManage,
  appliedCount,
  copyTargets = [],
  onEdit,
  onApply,
  onPromote,
  onDemote,
  onDelete,
  onCopyTo,
}: IModelKitCardProps) {
  const { lines, missing } = useMemo(() => buildKitPreview(kit, partsById), [kit, partsById]);
  const totals = useMemo(() => computeKitTotals(lines), [lines]);
  const coverage = useMemo(
    () =>
      getFamilyCoverage(
        kit.category,
        lines.map((line) => ({
          subcategory: line.part.subcategory,
          name: line.part.name,
          isOptional: line.isOptional,
        })),
      ),
    [kit.category, lines],
  );

  const categoryLabel = KIT_CATEGORY_CONFIG[kit.category].label;
  const missingLabels = coverage.missingRequired.map((f) => KIT_FAMILIES[f].label.toLowerCase());

  return (
    <Card className="overflow-hidden rounded-xl border border-border bg-card p-0">
      {/* Identity + money */}
      <header className="flex flex-wrap items-start gap-3 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{kit.name}</h3>
            <KitStatusBadge status={kit.status} />
            <KitCategoryBadge category={kit.category} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              {totals.baseCount} {totals.baseCount === 1 ? "peça base" : "peças base"}
              {totals.optionalCount > 0 && ` · ${totals.optionalCount} opcionais`}
            </span>
            {appliedCount !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {appliedCount > 0
                    ? `aplicado ${appliedCount}× em orçamentos`
                    : "ainda não aplicado"}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>atualizado {formatDateBR(kit.updatedAt)}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums text-foreground">
            {formatBRL(totals.base)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {totals.optionalCount > 0
              ? `com opcionais ${formatBRL(totals.total)}`
              : "sem opcionais"}
          </div>
        </div>
      </header>

      {/* Curation warnings — none of them block applying the kit */}
      {(missingLabels.length > 0 || totals.outOfStockCount > 0 || missing > 0) && (
        <div className="flex flex-col gap-1.5 px-4 pt-2">
          {missingLabels.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-severity-warning">
              <Icon icon="mdi:alert-outline" size={14} className="mt-px shrink-0" />
              <span>
                Sem filtro de {familyList(missingLabels)} — a categoria {categoryLabel} espera{" "}
                {missingLabels.length === 1 ? "essa família" : "essas famílias"}.
              </span>
            </p>
          )}
          {totals.outOfStockCount > 0 && (
            <p className="flex items-start gap-2 text-xs text-severity-critical">
              <Icon icon="mdi:alert-outline" size={14} className="mt-px shrink-0" />
              <span>
                {totals.outOfStockCount === 1
                  ? "1 peça sem estoque"
                  : `${totals.outOfStockCount} peças sem estoque`}{" "}
                — o kit ainda aplica, o orçamento avisa.
              </span>
            </p>
          )}
          {missing > 0 && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Icon icon="mdi:information-outline" size={14} className="mt-px shrink-0" />
              <span>
                {missing === 1
                  ? "1 peça saiu do catálogo e é ignorada na aplicação."
                  : `${missing} peças saíram do catálogo e são ignoradas na aplicação.`}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Composition */}
      <div className="px-4 pb-1 pt-2">
        {lines.map((line, index) => (
          <KitPartLine
            // A part can legitimately appear twice (base + optional), so the id alone is not unique.
            key={`${line.part.id}-${index}`}
            part={line.part}
            quantity={line.defaultQuantity}
            isOptional={line.isOptional}
            note={line.note}
          />
        ))}
      </div>

      {/* Actions */}
      <footer className="mt-1 flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-3">
        {canManage && (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Icon icon="mdi:pencil-outline" size={16} />
            Editar composição
          </Button>
        )}

        <Button size="sm" onClick={onApply} className="gap-1.5">
          <Icon icon="mdi:file-document-plus-outline" size={16} />
          Aplicar em orçamento
        </Button>

        {canManage && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon icon="mdi:dots-vertical" size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onCopyTo &&
                  copyTargets.map((target) => (
                    <DropdownMenuItem key={target.id} onClick={() => onCopyTo(target)}>
                      <Icon icon="mdi:content-copy" size={16} className="mr-2" />
                      Copiar para o {target.engine}
                    </DropdownMenuItem>
                  ))}
                {onCopyTo && copyTargets.length > 0 && <DropdownMenuSeparator />}

                {kit.status === "rascunho" ? (
                  <DropdownMenuItem onClick={onPromote}>
                    <Icon icon="mdi:check-decagram-outline" size={16} className="mr-2" />
                    Promover a oficial
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onDemote}>
                    <Icon icon="mdi:pencil-ruler" size={16} className="mr-2" />
                    Voltar para rascunho
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Icon icon="mdi:trash-can-outline" size={16} className="mr-2" />
                  Excluir kit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </footer>
    </Card>
  );
}
