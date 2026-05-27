import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";

interface IProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
}

export function DisputeDialog({ open, onClose, onSubmit }: IProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const disabled = reason.trim().length < 5 || submitting;

  const handleSubmit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.disputeTitle}</DialogTitle>
          <DialogDescription>{S.disputeReasonLabel}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={5}
          maxLength={500}
          value={reason}
          placeholder={S.disputeReasonPlaceholder}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {submitting ? "Enviando…" : S.disputeCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
