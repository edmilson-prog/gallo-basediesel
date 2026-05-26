import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, ILead } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { CLOSING_STAGE_ID } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.lostModal;

export interface IMarkAsLostModalProps {
  lead: ILead | null;
  onClose: () => void;
  onMarked?: (lead: ILead) => void;
}

export function MarkAsLostModal({ lead, onClose, onMarked }: IMarkAsLostModalProps) {
  const provider = useLeadsProvider();
  const queryClient = useQueryClient();
  const { currentStoreId } = useCurrentStore();
  const { lossReasons, stages } = usePipelineSettings(currentStoreId);

  const [reason, setReason] = useState<ID>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setReason("");
      setNotes("");
      setError(null);
    }
  }, [lead]);

  const handleSubmit = async () => {
    if (!lead) return;
    if (!reason) {
      setError(COPY.requiredReason);
      return;
    }
    const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
    const lossReason = lossReasons.find((r) => r.id === reason);
    setBusy(true);
    try {
      const updated = await provider.update(lead.id, {
        stage: closingStage,
        lossReason: lossReason?.name ?? reason,
        lossNotes: notes.trim() ? notes.trim() : undefined,
      });
      auditLog({
        action: "lead.lost",
        resource: "lead",
        resourceId: lead.id,
        before: { stageId: lead.stage.id },
        after: {
          stageId: closingStage.id,
          lossReason: lossReason?.name ?? reason,
          lossNotes: notes.trim() || undefined,
        },
      });
      toast.success(COPY.successToast);
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      onMarked?.(updated);
    } catch {
      toast.error(COPY.errorToast);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{COPY.reason}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder={COPY.reasonPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {lossReasons
                  .filter((r) => r.active)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {error && <p className="text-[10px] text-destructive">{error}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{COPY.notes}</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={COPY.notesPlaceholder}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy} variant="destructive">
            {busy ? COPY.submitting : COPY.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
