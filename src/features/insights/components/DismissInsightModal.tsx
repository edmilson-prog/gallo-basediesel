import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

export interface IDismissInsightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insightTitle: string;
  onConfirm: (reason: string | undefined) => void;
}

export function DismissInsightModal({
  open,
  onOpenChange,
  insightTitle,
  onConfirm,
}: IDismissInsightModalProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    const trimmed = reason.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{S.modalTitle}</DialogTitle>
          <DialogDescription>{S.modalDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {insightTitle}
          </p>

          <div className="space-y-1">
            <Label htmlFor="dismiss-reason">{S.modalReasonLabel}</Label>
            <Textarea
              id="dismiss-reason"
              placeholder={S.modalReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {S.modalCancel}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {S.modalConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
