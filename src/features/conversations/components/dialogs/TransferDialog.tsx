import { useEffect, useState } from "react";
import type { ID, ISeller } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useSellersProvider } from "@/providers/data";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

export interface ITransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: ID;
  excludeSellerId?: ID;
  onConfirm: (sellerId: ID, sellerName: string) => Promise<void> | void;
}

export function TransferDialog({
  open,
  onOpenChange,
  storeId,
  excludeSellerId,
  onConfirm,
}: ITransferDialogProps) {
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void sellersProvider
      .list({ storeId })
      .then((res) => {
        if (cancelled) return;
        const filtered = res.filter((s: ISeller) => s.id !== excludeSellerId);
        setSellers(filtered);
        setSelected((prev) => prev || filtered[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setSellers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [excludeSellerId, open, sellersProvider, storeId]);

  const handleConfirm = async () => {
    const seller = sellers.find((s) => s.id === selected);
    if (!seller) return;
    setSaving(true);
    try {
      await onConfirm(seller.id, seller.fullName);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{CONVERSATION_STRINGS.transferDialog.title}</DialogTitle>
          <DialogDescription>{CONVERSATION_STRINGS.transferDialog.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="transfer-seller">{CONVERSATION_STRINGS.transferDialog.placeholder}</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="transfer-seller">
              <SelectValue placeholder={CONVERSATION_STRINGS.transferDialog.placeholder} />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {CONVERSATION_STRINGS.transferDialog.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || saving}>
            {CONVERSATION_STRINGS.transferDialog.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
