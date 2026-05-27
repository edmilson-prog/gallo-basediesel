import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordAuditLogSync, useGoalsProvider } from "@/providers/data";
import type { ID, IGoal } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

export interface ICancelGoalDialogProps {
  goal: IGoal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: ID;
  onCanceled?: () => void;
}

export function CancelGoalDialog({
  goal,
  open,
  onOpenChange,
  actorId,
  onCanceled,
}: ICancelGoalDialogProps) {
  const goalsProvider = useGoalsProvider();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(undefined);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError(S.cancelReasonRequired);
      return;
    }
    setIsSaving(true);
    try {
      await goalsProvider.update(goal.id, {
        status: "cancelada",
        cancelReason: reason.trim(),
      });
      recordAuditLogSync({
        actorId,
        action: "goal_cancel",
        resource: "goal",
        resourceId: goal.id,
        storeId: goal.storeId,
      });
      toast.success(S.cancelSuccess);
      onOpenChange(false);
      onCanceled?.();
    } catch {
      toast.error(S.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{S.cancelDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação registra um audit log. O motivo abaixo será visível no histórico da meta.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">{S.cancelReasonLabel}</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            placeholder={S.cancelReasonPlaceholder}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(undefined);
            }}
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>{S.formCancelCta}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
          >
            {S.cancelCta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
