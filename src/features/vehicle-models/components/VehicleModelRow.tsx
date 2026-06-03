import { Link } from "@tanstack/react-router";
import type { IVehicleModel } from "@/shared/types";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandAvatar } from "./BrandAvatar";

export interface IVehicleModelRowProps {
  model: IVehicleModel;
  kitCounts?: { total: number; rascunhos: number };
  canManage: boolean;
  onEdit: (m: IVehicleModel) => void;
  onToggleStatus: (m: IVehicleModel) => void;
  onDelete: (m: IVehicleModel) => void;
}

function formatYearRange(yearStart?: number, yearEnd?: number): string | null {
  if (!yearStart) return null;
  const end = yearEnd != null ? String(yearEnd) : "atual";
  return `${yearStart}–${end}`;
}

export function VehicleModelRow({
  model,
  kitCounts,
  canManage,
  onEdit,
  onToggleStatus,
  onDelete,
}: IVehicleModelRowProps) {
  const isInactive = model.status === "inativo";
  const yearRange = formatYearRange(model.yearStart, model.yearEnd);
  const totalKits = kitCounts?.total ?? 0;
  const pendingDrafts = kitCounts?.rascunhos ?? 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border py-3 first:border-t-0",
        isInactive && "opacity-60",
      )}
    >
      {/* Clickable area — Link to model detail */}
      <Link
        to="/app/kits/$modelId"
        params={{ modelId: model.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver detalhes de ${model.brand} ${model.model}`}
      >
        <BrandAvatar brand={model.brand} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-foreground">{model.model}</span>
            {isInactive && (
              <Badge variant="outline" className="text-xs">
                Inativo
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm">
            <span className="tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground/70">{model.engine}</span>
            </span>
            {yearRange && <span className="tabular-nums text-muted-foreground">{yearRange}</span>}
          </div>
        </div>

        {/* Kits pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={-1}>
              <Badge variant="secondary" className="shrink-0 items-center gap-1 text-xs">
                Kits {totalKits}
                {pendingDrafts > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 text-muted-foreground"
                    aria-label={`${pendingDrafts} ${pendingDrafts === 1 ? "rascunho pendente" : "rascunhos pendentes"}`}
                  >
                    <span aria-hidden="true">·</span>
                    <Icon icon="mdi:circle" size={8} className="text-muted-foreground" />
                    <span>
                      {pendingDrafts} {pendingDrafts === 1 ? "rascunho" : "rascunhos"}
                    </span>
                  </span>
                )}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {pendingDrafts > 0
              ? `${pendingDrafts} ${pendingDrafts === 1 ? "rascunho pendente" : "rascunhos pendentes"}`
              : `${totalKits} ${totalKits === 1 ? "kit" : "kits"} neste modelo`}
          </TooltipContent>
        </Tooltip>
      </Link>

      {/* Actions menu — sibling of Link, never nested inside */}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações para ${model.brand} ${model.model}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:dots-vertical" size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(model)}>
              <Icon icon="mdi:pencil-outline" size={16} className="mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(model)}>
              {model.status === "ativo" ? (
                <>
                  <Icon icon="mdi:archive-outline" size={16} className="mr-2" />
                  Inativar
                </>
              ) : (
                <>
                  <Icon icon="mdi:restore" size={16} className="mr-2" />
                  Reativar
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
      )}
    </div>
  );
}
