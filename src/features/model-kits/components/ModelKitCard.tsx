import type { IVehicleModelKit, IPart, ID } from "@/shared/types";
import type { ModelKitCategory } from "@/shared/types";
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
import { KitCategoryBadge } from "./KitCategoryBadge";
import { KitStatusBadge } from "./KitStatusBadge";
import { KitItemsPreview } from "./KitItemsPreview";

const CATEGORY_ICON: Record<ModelKitCategory, string> = {
  filtros: "mdi:air-filter",
  freios: "mdi:car-brake-alarm",
  correia: "mdi:fan",
  revisao: "mdi:wrench-clock",
  custom: "mdi:package-variant",
};

export interface IModelKitCardProps {
  kit: IVehicleModelKit;
  partsById: Map<ID, IPart>;
  canManage: boolean;
  onEdit(): void;
  onApply(): void;
  onPromote(): void;
  onDemote(): void;
  onDelete(): void;
}

export function ModelKitCard({
  kit,
  partsById,
  canManage,
  onEdit,
  onApply,
  onPromote,
  onDemote,
  onDelete,
}: IModelKitCardProps) {
  return (
    <Card className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            icon={CATEGORY_ICON[kit.category]}
            size={20}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate font-medium text-foreground">{kit.name}</span>
        </div>
        <KitStatusBadge status={kit.status} />
      </div>

      {/* Meta row */}
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <KitCategoryBadge category={kit.category} />
        <span>{kit.items.length} itens</span>
      </div>

      {/* Items preview */}
      <div className="mt-3">
        <KitItemsPreview items={kit.items} partsById={partsById} />
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex min-h-[44px] items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} className="min-h-[44px]">
          <Icon icon="mdi:pencil-outline" size={16} className="mr-1.5" />
          Editar
        </Button>

        <Button variant="default" size="sm" onClick={onApply} className="min-h-[44px]">
          <Icon icon="mdi:plus" size={16} className="mr-1.5" />
          Aplicar
        </Button>

        {canManage && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="grid h-[44px] w-[44px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon icon="mdi:dots-vertical" size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </Card>
  );
}
