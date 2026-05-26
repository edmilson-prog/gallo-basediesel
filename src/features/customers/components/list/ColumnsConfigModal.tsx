import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  COLUMN_LABELS,
  DEFAULT_VISIBLE_OPTIONAL,
  OPTIONAL_COLUMNS,
  type OptionalColumn,
} from "../../utils/columns";

export interface IColumnsConfigModalProps {
  open: boolean;
  visible: OptionalColumn[];
  onClose: () => void;
  onChange: (next: OptionalColumn[]) => void;
}

export function ColumnsConfigModal({ open, visible, onClose, onChange }: IColumnsConfigModalProps) {
  const [draft, setDraft] = useState<OptionalColumn[]>(visible);

  const toggle = (id: OptionalColumn) => {
    setDraft((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar colunas</DialogTitle>
          <DialogDescription>
            Escolha quais colunas opcionais ficam visíveis. A configuração é salva no seu navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {OPTIONAL_COLUMNS.map((id) => (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={draft.includes(id)} onCheckedChange={() => toggle(id)} />
              <span>{COLUMN_LABELS[id]}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_VISIBLE_OPTIONAL)}>
            Restaurar padrão
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
