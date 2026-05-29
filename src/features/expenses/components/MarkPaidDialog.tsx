import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ExpensePaymentMethod, IExpense } from "@/shared/types";
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
import { dateInputToIso, isoToDateInput, todayDateInput } from "../utils/dateInput";
import { EXPENSE_PAYMENT_METHOD_LABELS, EXPENSES_STRINGS as S } from "../i18n/pt-BR";

const METHODS = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];

interface IMarkPaidDialogProps {
  expense: IExpense | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    paymentDate: string;
    paymentMethod?: ExpensePaymentMethod;
  }) => Promise<void>;
}

export function MarkPaidDialog({ expense, onOpenChange, onConfirm }: IMarkPaidDialogProps) {
  const [date, setDate] = useState(todayDateInput());
  const [method, setMethod] = useState<ExpensePaymentMethod | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const open = expense !== null;

  // Reset local state whenever a new expense opens the dialog.
  useEffect(() => {
    if (expense) {
      setDate(isoToDateInput(expense.dueDate) || todayDateInput());
      setMethod(undefined);
    }
  }, [expense]);

  const handleConfirm = async () => {
    if (!expense) return;
    setBusy(true);
    try {
      await onConfirm({
        paymentDate: dateInputToIso(date),
        paymentMethod: method ?? expense.paymentMethod,
      });
      toast.success(S.markPaidSuccess);
      onOpenChange(false);
    } catch {
      toast.error(S.markPaidError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{S.markPaidTitle}</DialogTitle>
        </DialogHeader>
        {expense && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{expense.description}</p>
            <div className="space-y-1.5">
              <Label htmlFor="markpaid-date">{S.markPaidDate}</Label>
              <Input
                id="markpaid-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{S.markPaidMethod}</Label>
              <Select
                value={method ?? expense.paymentMethod ?? ""}
                onValueChange={(v) => setMethod(v as ExpensePaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={S.markPaidMethod} />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {EXPENSE_PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {S.cancelKeep}
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !date}>
            {S.markPaidConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
