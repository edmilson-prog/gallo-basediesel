import { useEffect, useState } from "react";
import type { SegmentScope } from "@/shared/types";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface ISaveSegmentModalProps {
  open: boolean;
  defaultScope?: SegmentScope;
  defaultName?: string;
  defaultDescription?: string;
  canCreateShared: boolean;
  onClose: () => void;
  onSubmit: (args: { name: string; description?: string; scope: SegmentScope }) => Promise<void>;
}

export function SaveSegmentModal({
  open,
  defaultScope = "private",
  defaultName = "",
  defaultDescription = "",
  canCreateShared,
  onClose,
  onSubmit,
}: ISaveSegmentModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [scope, setScope] = useState<SegmentScope>(canCreateShared ? defaultScope : "private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription(defaultDescription);
      setScope(canCreateShared ? defaultScope : "private");
      setError(null);
    }
  }, [open, defaultName, defaultDescription, defaultScope, canCreateShared]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nome obrigatório.");
      return;
    }
    if (trimmed.length > 50) {
      setError("Use até 50 caracteres.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim() || undefined,
        scope,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar segmentação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Salvar segmentação</DialogTitle>
            <DialogDescription>
              Os filtros atualmente aplicados serão salvos com um nome curto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="segment-name">Nome</Label>
              <Input
                id="segment-name"
                value={name}
                maxLength={50}
                onChange={(e) => setName(e.target.value)}
                placeholder='Ex: "Clientes A dormentes"'
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="segment-description">Descrição (opcional)</Label>
              <Input
                id="segment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anote o objetivo do filtro"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as SegmentScope)}
                className="flex flex-col gap-2"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
                  <RadioGroupItem value="private" className="mt-1" />
                  <div>
                    <p className="font-medium">Privada</p>
                    <p className="text-xs text-muted-foreground">Visível apenas para você.</p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm ${canCreateShared ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-60"}`}
                >
                  <RadioGroupItem value="shared" className="mt-1" disabled={!canCreateShared} />
                  <div>
                    <p className="font-medium">Compartilhada</p>
                    <p className="text-xs text-muted-foreground">
                      Toda a loja pode aplicar.
                      {!canCreateShared && " Apenas Gestor/Owner pode criar."}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
