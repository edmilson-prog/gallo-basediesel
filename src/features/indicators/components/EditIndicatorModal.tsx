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
import { recordAuditLogSync, useIndicatorsProvider } from "@/providers/data";
import type { ID, IProductIndicator } from "@/shared/types";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

export interface IEditIndicatorModalProps {
  indicator: IProductIndicator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: ID;
  onSaved?: (updated: IProductIndicator) => void;
}

export function EditIndicatorModal({
  indicator,
  open,
  onOpenChange,
  actorId,
  onSaved,
}: IEditIndicatorModalProps) {
  const indicatorsProvider = useIndicatorsProvider();
  const [name, setName] = useState(indicator.name ?? "");
  const [targetValue, setTargetValue] = useState(indicator.targetValue);
  const [rewardDescription, setRewardDescription] = useState(indicator.rewardDescription ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(indicator.name ?? "");
      setTargetValue(indicator.targetValue);
      setRewardDescription(indicator.rewardDescription ?? "");
    }
  }, [open, indicator]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const patch: Partial<IProductIndicator> = {
        name,
        targetValue,
        rewardDescription: rewardDescription.trim() || undefined,
      };
      const updated = await indicatorsProvider.update(indicator.id, patch);
      recordAuditLogSync({
        actorId,
        action: "indicator_update",
        resource: "indicator",
        resourceId: indicator.id,
        storeId: indicator.storeId,
      });
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
            <Label htmlFor="ind-edit-name">{S.form.nameLabel}</Label>
            <Input id="ind-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ind-edit-target">{S.form.targetLabel}</Label>
            <Input
              id="ind-edit-target"
              type="number"
              min={0}
              value={targetValue || ""}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ind-edit-reward">{S.form.rewardLabel}</Label>
            <Textarea
              id="ind-edit-reward"
              rows={3}
              placeholder={S.form.rewardPlaceholder}
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {S.form.cancelCta}
          </Button>
          <Button
            type="button"
            disabled={isSaving || !name.trim() || targetValue <= 0}
            onClick={() => void handleSave()}
          >
            {S.form.saveChangesCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
