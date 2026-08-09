import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";

export interface IContactsBulkBarProps {
  selectedCount: number;
  /** Total matching the current filters, from the server. */
  totalFiltered: number;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  onAddTag: () => void;
  onRemoveTag: () => void;
  onTransferOwner: () => void;
  onExport: () => void;
  onOptOut: () => void;
}

/**
 * Bulk actions bar — only rendered when something is selected.
 *
 * "Envio em massa" from the kit is absent in this phase: the dispatch
 * infrastructure belongs to a later one, and a button that opens nothing
 * reads as broken.
 */
export function ContactsBulkBar({
  selectedCount,
  totalFiltered,
  onClearSelection,
  onSelectAllFiltered,
  onAddTag,
  onRemoveTag,
  onTransferOwner,
  onExport,
  onOptOut,
}: IContactsBulkBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2">
      <span className="text-xs font-semibold text-primary">
        {selectedCount} {selectedCount === 1 ? "selecionado" : "selecionados"}
      </span>

      {selectedCount < totalFiltered && (
        <Button variant="link" size="sm" className="h-7 px-1 text-xs" onClick={onSelectAllFiltered}>
          Selecionar todos os {totalFiltered.toLocaleString("pt-BR")} filtrados
        </Button>
      )}

      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearSelection}>
        Limpar
      </Button>

      <div className="h-5 w-px bg-border" aria-hidden />

      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAddTag}>
        <Icon icon="mdi:tag-plus-outline" size={14} />
        Adicionar etiqueta
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRemoveTag}>
        <Icon icon="mdi:tag-minus-outline" size={14} />
        Remover etiqueta
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onTransferOwner}>
        <Icon icon="mdi:account-switch-outline" size={14} />
        Transferir responsável
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onExport}>
        <Icon icon="mdi:download" size={14} />
        Exportar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-severity-critical/40 text-xs text-severity-critical hover:bg-severity-critical/10"
        onClick={onOptOut}
      >
        <Icon icon="mdi:shield-off-outline" size={14} />
        Bloquear / opt-out
      </Button>
    </div>
  );
}
