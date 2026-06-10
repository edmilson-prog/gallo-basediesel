import { useEffect, useState } from "react";
import type { ICommission } from "@/shared/types";
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
  commission: ICommission | null;
  onClose: () => void;
  onResolve: (note: string, finalStatus: "approved" | "canceled") => Promise<void> | void;
}

export function ResolveDisputeDialog({ open, commission, onClose, onResolve }: IProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  const handle = async (finalStatus: "approved" | "canceled") => {
    if (note.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      await onResolve(note.trim(), finalStatus);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.disputeResolveTitle}</DialogTitle>
          <DialogDescription>
            {commission
              ? `Pedido #${commission.orderNumber ?? commission.orderId.replace(/^order-/, "PD-")}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {commission?.disputeReason && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
            <strong className="block">Justificativa do vendedor:</strong>
            <span>{commission.disputeReason}</span>
          </div>
        )}
        <Textarea
          autoFocus
          rows={4}
          maxLength={500}
          value={note}
          placeholder={S.disputeResolveNoteLabel}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handle("canceled")}
            disabled={busy || note.trim().length < 3}
          >
            {S.disputeResolveCancel}
          </Button>
          <Button onClick={() => void handle("approved")} disabled={busy || note.trim().length < 3}>
            {S.disputeResolveApprove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
