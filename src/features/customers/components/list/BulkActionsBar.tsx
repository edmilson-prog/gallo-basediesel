import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface IBulkActionsBarProps {
  count: number;
  totalFiltered: number;
  isPageScope: boolean;
  canTransfer: boolean;
  canExport: boolean;
  onClear: () => void;
  onSelectAllFiltered: () => void;
  onAddTag: () => void;
  onRemoveTag: () => void;
  onTransferSeller: () => void;
  onMarkDormant: () => void;
}

export function BulkActionsBar({
  count,
  totalFiltered,
  isPageScope,
  canTransfer,
  canExport,
  onClear,
  onSelectAllFiltered,
  onAddTag,
  onRemoveTag,
  onTransferSeller,
  onMarkDormant,
}: IBulkActionsBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs">
      <span className="font-semibold text-primary">
        {count} {count === 1 ? "selecionado" : "selecionados"}
      </span>
      {isPageScope && totalFiltered > count && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-primary"
          onClick={onSelectAllFiltered}
        >
          Selecionar todos os {totalFiltered} filtrados
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
        Limpar
      </Button>

      <div className="mx-2 hidden h-4 w-px bg-border sm:block" />

      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onAddTag}>
        <Icon icon="mdi:tag-plus-outline" size={14} />
        Adicionar tag
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onRemoveTag}>
        <Icon icon="mdi:tag-remove-outline" size={14} />
        Remover tag
      </Button>
      {canTransfer && (
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onTransferSeller}>
          <Icon icon="mdi:account-switch-outline" size={14} />
          Transferir vendedor
        </Button>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onMarkDormant}>
        <Icon icon="mdi:moon-waning-crescent" size={14} />
        Marcar dormente
      </Button>

      {canExport && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Icon icon="mdi:download-outline" size={14} />
              Exportar
              <Icon icon="mdi:chevron-down" size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem disabled>
                  <Icon icon="mdi:file-delimited-outline" size={14} />
                  Exportar CSV
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>Disponível na Fase 2</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem disabled>
                  <Icon icon="mdi:shield-account-outline" size={14} />
                  Exportar dados (LGPD)
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>Disponível na Fase 2</TooltipContent>
            </Tooltip>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
