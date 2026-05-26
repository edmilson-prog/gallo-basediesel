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

export interface IRemoveTagModalProps {
  open: boolean;
  presentTags: string[];
  affectedCount: number;
  onClose: () => void;
  onSubmit: (tagsToRemove: string[]) => Promise<void>;
}

export function RemoveTagModal({
  open,
  presentTags,
  affectedCount,
  onClose,
  onSubmit,
}: IRemoveTagModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggle = (t: string) => {
    setSelected((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selected);
      setSelected([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remover tag</DialogTitle>
          <DialogDescription>
            Escolha quais tags remover dos <strong>{affectedCount}</strong> clientes selecionados. A
            remoção só atinge clientes que já possuem a tag.
          </DialogDescription>
        </DialogHeader>
        {presentTags.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Nenhum dos clientes selecionados possui tags.
          </p>
        ) : (
          <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
            {presentTags.map((tag) => (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox checked={selected.includes(tag)} onCheckedChange={() => toggle(tag)} />
                <span className="truncate">{tag}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={selected.length === 0 || isSubmitting}
          >
            {isSubmitting ? "Removendo…" : `Remover (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
