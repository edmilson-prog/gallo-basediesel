import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ExpenseSeriesScope } from "@/providers/data";
import type { IExpense } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EXPENSES_STRINGS as S } from "../i18n/pt-BR";

interface ICancelExpenseDialogProps {
  expense: IExpense | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { reason?: string; scope: ExpenseSeriesScope }) => Promise<void>;
}

export function CancelExpenseDialog({
  expense,
  onOpenChange,
  onConfirm,
}: ICancelExpenseDialogProps) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<ExpenseSeriesScope>("one");
  const [busy, setBusy] = useState(false);
  const open = expense !== null;
  const isRecurring = expense?.isRecurring ?? false;

  useEffect(() => {
    if (expense) {
      setReason("");
      setScope("one");
    }
  }, [expense]);

  const handleConfirm = async () => {
    if (!expense) return;
    setBusy(true);
    try {
      await onConfirm({ reason: reason.trim() || undefined, scope });
      toast.success(scope === "one" ? S.cancelSuccess : S.seriesCanceled);
      onOpenChange(false);
    } catch {
      toast.error(S.cancelError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{S.cancelTitle}</DialogTitle>
          <DialogDescription>{expense?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isRecurring && (
            <div className="space-y-2">
              <Label>{S.scopeQuestion}</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as ExpenseSeriesScope)}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="one" /> {S.scopeOne}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="future" /> {S.scopeFuture}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="all" /> {S.scopeAll}
                </label>
              </RadioGroup>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">{S.cancelReason}</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {S.cancelKeep}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {S.cancelConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
