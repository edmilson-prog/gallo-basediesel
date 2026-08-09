import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { recordAuditLogSync, useGoalsProvider } from "@/providers/data";
import type { ID, IGoal } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

export interface IEditGoalModalProps {
  goal: IGoal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: ID;
  onSaved?: (updated: IGoal) => void;
}

export function EditGoalModal({ goal, open, onOpenChange, actorId, onSaved }: IEditGoalModalProps) {
  const goalsProvider = useGoalsProvider();
  const [name, setName] = useState(goal.name ?? "");
  const [targetValue, setTargetValue] = useState(goal.targetValue);
  const [rewardDescription, setRewardDescription] = useState(goal.rewardDescription ?? "");
  const [confirmTargetChange, setConfirmTargetChange] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(goal.name ?? "");
      setTargetValue(goal.targetValue);
      setRewardDescription(goal.rewardDescription ?? "");
      setConfirmTargetChange(false);
    }
  }, [open, goal]);

  const targetChanged = targetValue !== goal.targetValue;
  const requiresConfirmation = targetChanged && (goal.status ?? "ativa") === "ativa";
  const canSave = !requiresConfirmation || confirmTargetChange;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const patch: Partial<IGoal> = {
        name,
        targetValue,
        rewardDescription: rewardDescription.trim() || undefined,
      };
      const updated = await goalsProvider.update(goal.id, patch);
      recordAuditLogSync({
        actorId,
        action: "goal_update",
        resource: "goal",
        resourceId: goal.id,
        storeId: goal.storeId,
      });
      if (targetChanged) {
        recordAuditLogSync({
          actorId,
          action: "goal_target_change",
          resource: "goal",
          resourceId: goal.id,
          storeId: goal.storeId,
        });
      }
      toast.success(S.updateSuccess);
      onOpenChange(false);
      onSaved?.(updated);
    } catch {
      toast.error(S.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{S.editModalTitle}</DialogTitle>
          <DialogDescription>{S.editFieldsLocked}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">{S.formConfigNameLabel}</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-target">{S.formTargetLabel}</Label>
            <Input
              id="edit-target"
              type="number"
              min={0}
              value={targetValue || ""}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-reward">{S.formRewardLabel}</Label>
            <Textarea
              id="edit-reward"
              rows={3}
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
            />
          </div>

          {requiresConfirmation && (
            <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-severity-warning">
                <Icon icon="mdi:alert-circle-outline" size={14} />
                {S.targetChangeWarningTitle}
              </p>
              <p className="mb-3 text-xs text-muted-foreground">{S.targetChangeWarning}</p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={confirmTargetChange}
                  onCheckedChange={(v) => setConfirmTargetChange(v === true)}
                />
                {S.targetChangeConfirm}
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {S.formCancelCta}
          </Button>
          <Button
            type="button"
            disabled={isSaving || !canSave || !name.trim() || targetValue <= 0}
            onClick={() => void handleSave()}
          >
            {S.formSaveChangesCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
