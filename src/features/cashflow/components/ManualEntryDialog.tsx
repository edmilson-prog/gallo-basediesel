import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CashFlowDirection } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayDateInput, dateInputToIso } from "@/features/expenses/utils/dateInput";
import { CASHFLOW_STRINGS as S } from "../i18n/pt-BR";

export interface IManualEntrySubmit {
  type: CashFlowDirection;
  amount: number;
  date: string;
  description: string;
}

interface IManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: IManualEntrySubmit) => Promise<void>;
}

export function ManualEntryDialog({ open, onOpenChange, onConfirm }: IManualEntryDialogProps) {
  const [type, setType] = useState<CashFlowDirection>("entrada");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDateInput());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType("entrada");
      setAmount("");
      setDate(todayDateInput());
      setDescription("");
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Informe um valor maior que zero.");
    if (!description.trim()) return setError("Informe uma descrição.");
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        type,
        amount: value,
        date: dateInputToIso(date),
        description: description.trim(),
      });
      toast.success(S.manualSaved);
      onOpenChange(false);
    } catch {
      toast.error(S.manualError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{S.manualTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{S.manualType}</Label>
            <Select value={type} onValueChange={(v) => setType(v as CashFlowDirection)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">{S.manualAporte}</SelectItem>
                <SelectItem value="saida">{S.manualRetirada}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-amount">{S.manualAmount}</Label>
              <Input
                id="cf-amount"
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-date">{S.manualDate}</Label>
              <Input
                id="cf-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-desc">{S.manualDescription}</Label>
            <Input
              id="cf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? "Salvando…" : S.manualSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
