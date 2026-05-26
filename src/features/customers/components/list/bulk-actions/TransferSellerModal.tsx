import { useEffect, useState } from "react";
import type { ID, ISeller } from "@/shared/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ITransferSellerModalProps {
  open: boolean;
  sellers: ISeller[];
  affectedCount: number;
  onClose: () => void;
  onSubmit: (args: { toSellerId: ID; reason: string }) => Promise<void>;
}

export function TransferSellerModal({
  open,
  sellers,
  affectedCount,
  onClose,
  onSubmit,
}: ITransferSellerModalProps) {
  const [toSellerId, setToSellerId] = useState<ID | "">("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setToSellerId("");
      setReason("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toSellerId) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        toSellerId,
        reason: reason.trim() || "Transferência em lote via Lista de Clientes",
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Transferir vendedor</DialogTitle>
            <DialogDescription>
              <strong>{affectedCount}</strong> clientes serão transferidos para o vendedor
              escolhido. A transferência é permanente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-seller">Vendedor de destino</Label>
              <Select value={toSellerId} onValueChange={(v) => setToSellerId(v)}>
                <SelectTrigger id="transfer-seller">
                  <SelectValue placeholder="Selecionar vendedor…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-reason">Motivo (opcional)</Label>
              <Input
                id="transfer-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: realocação de carteira"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!toSellerId || isSubmitting}>
              {isSubmitting ? "Transferindo…" : "Transferir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
