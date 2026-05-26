import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";

export interface IAddTagModalProps {
  open: boolean;
  affectedCount: number;
  availableTags: string[];
  onClose: () => void;
  onSubmit: (tagsToAdd: string[]) => Promise<void>;
}

export function AddTagModal({
  open,
  affectedCount,
  availableTags,
  onClose,
  onSubmit,
}: IAddTagModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableTags.slice(0, 10);
    return availableTags
      .filter((t) => t.toLowerCase().includes(q) && !selected.includes(t))
      .slice(0, 10);
  }, [query, availableTags, selected]);

  const addCustom = () => {
    const t = query.trim();
    if (!t) return;
    if (!selected.includes(t)) setSelected([...selected, t]);
    setQuery("");
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selected);
      setSelected([]);
      setQuery("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar tag</DialogTitle>
          <DialogDescription>
            Tags serão aplicadas aos <strong>{affectedCount}</strong> clientes selecionados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Digite uma tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button variant="outline" onClick={addCustom} disabled={!query.trim()}>
              <Icon icon="mdi:plus" size={16} />
            </Button>
          </div>

          {filteredSuggestions.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Sugestões
              </p>
              <div className="flex flex-wrap gap-1">
                {filteredSuggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (!selected.includes(t)) setSelected([...selected, t]);
                    }}
                    className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Selecionadas
              </p>
              <div className="flex flex-wrap gap-1">
                {selected.map((t) => (
                  <Badge key={t} variant="outline" className="gap-1 bg-primary/10 text-primary">
                    {t}
                    <button
                      type="button"
                      onClick={() => setSelected(selected.filter((s) => s !== t))}
                      aria-label={`Remover ${t}`}
                    >
                      <Icon icon="mdi:close" size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={selected.length === 0 || isSubmitting}>
            {isSubmitting ? "Aplicando…" : `Aplicar (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
