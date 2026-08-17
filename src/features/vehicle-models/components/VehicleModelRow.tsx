import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelKitCell } from "@/features/model-kits/components/ModelKitCell";
import { formatYearRange } from "../utils/formatYearRange";
import { BrandAvatar } from "./BrandAvatar";

/** A sibling engine's kit, offered as a one-click copy onto this model. */
export interface ISiblingKitOffer {
  kit: IVehicleModelKit;
  source: IVehicleModel;
}

export interface IVehicleModelRowProps {
  model: IVehicleModel;
  /** Kits of this model, in curation order. */
  kits: IVehicleModelKit[];
  partsById: Map<ID, IPart>;
  compatibleCount: number;
  applicationCounts: Record<ID, number>;
  applicationsReady: boolean;
  /** Set when this model has no kit but a sibling engine does. */
  siblingOffer?: ISiblingKitOffer;
  /** Rendered inside an engine block — the designation is already on screen. */
  indent?: boolean;
  canManage: boolean;
  canBuildKit: boolean;
  onOpen: (m: IVehicleModel) => void;
  onBuild: (m: IVehicleModel) => void;
  onCopy: (offer: ISiblingKitOffer, target: IVehicleModel) => void;
  onEdit: (m: IVehicleModel) => void;
  onToggleStatus: (m: IVehicleModel) => void;
  onDelete: (m: IVehicleModel) => void;
}

export function VehicleModelRow({
  model,
  kits,
  partsById,
  compatibleCount,
  applicationCounts,
  applicationsReady,
  siblingOffer,
  indent,
  canManage,
  canBuildKit,
  onOpen,
  onBuild,
  onCopy,
  onEdit,
  onToggleStatus,
  onDelete,
}: IVehicleModelRowProps) {
  const isInactive = model.status === "inativo";
  const years = formatYearRange(model.yearStart, model.yearEnd);

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-border py-2.5 pr-3 transition-colors hover:bg-muted/40",
        "sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto]",
        indent ? "pl-9" : "pl-3",
        isInactive && "opacity-60",
      )}
    >
      {/* Identity — a button, not a Link wrapper, so the copy shortcut below can
          be a sibling instead of a nested interactive element. */}
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpen(model)}
          className="flex min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Abrir ${model.brand} ${model.model} ${model.engine}`}
        >
          {!indent && <BrandAvatar brand={model.brand} className="size-7" />}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-foreground">
                {indent ? model.engine : model.model}
              </span>
              {!indent && (
                <span className="text-sm font-medium text-muted-foreground">{model.engine}</span>
              )}
              {years && <span className="text-xs tabular-nums text-muted-foreground">{years}</span>}
              {isInactive && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Inativo
                </Badge>
              )}
            </span>
          </span>
        </button>

        {siblingOffer && (
          <button
            type="button"
            onClick={() => onCopy(siblingOffer, model)}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-severity-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:subdirectory-arrow-right" size={13} />
            copiar o kit do {siblingOffer.source.engine}
          </button>
        )}
      </div>

      <ModelKitCell
        kits={kits}
        partsById={partsById}
        compatibleCount={compatibleCount}
        applicationCounts={applicationCounts}
        applicationsReady={applicationsReady}
        canBuild={canBuildKit}
        onOpen={() => onOpen(model)}
        onBuild={() => onBuild(model)}
      />

      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações para ${model.brand} ${model.model} ${model.engine}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:dots-vertical" size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canBuildKit && (
              <DropdownMenuItem onClick={() => onBuild(model)}>
                <Icon icon="mdi:plus" size={16} className="mr-2" />
                Montar kit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onEdit(model)}>
              <Icon icon="mdi:pencil-outline" size={16} className="mr-2" />
              Editar modelo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(model)}>
              {isInactive ? (
                <>
                  <Icon icon="mdi:restore" size={16} className="mr-2" />
                  Reativar
                </>
              ) : (
                <>
                  <Icon icon="mdi:archive-outline" size={16} className="mr-2" />
                  Inativar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(model)}
              className="text-destructive focus:text-destructive"
            >
              <Icon icon="mdi:trash-can-outline" size={16} className="mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="hidden sm:block sm:size-8" />
      )}
    </div>
  );
}
