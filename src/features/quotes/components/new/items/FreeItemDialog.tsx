// src/features/quotes/components/new/items/FreeItemDialog.tsx
import { useState } from "react";
import type { IQuoteItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildFreeItem } from "../../../utils/quoteItemOps";

export interface IFreeItemDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (item: IQuoteItem) => void;
}

export function FreeItemDialog({ open, onClose, onAdd }: IFreeItemDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [quantity, setQuantity] = useState(1);

  const canAdd = name.trim().length > 0 && Number(price) > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(buildFreeItem({ name, unitPrice: Number(price), quantity }));
    setName("");
    setPrice("0");
    setQuantity(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Item avulso (sem cadastro)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="free-name">Descrição</Label>
            <Input
              id="free-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Mão de obra, taxa, peça sob encomenda"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="free-price">Preço unitário (R$)</Label>
              <Input
                id="free-price"
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="free-qty">Quantidade</Label>
              <Input
                id="free-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canAdd} onClick={handleAdd}>
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
