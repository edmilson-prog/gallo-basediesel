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
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

export interface INoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (content: string) => Promise<void> | void;
}

export function NoteDialog({ open, onOpenChange, onConfirm }: INoteDialogProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError(CONVERSATION_STRINGS.noteEmpty);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
      setContent("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setContent("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{CONVERSATION_STRINGS.noteDialog.title}</DialogTitle>
          <DialogDescription>{CONVERSATION_STRINGS.noteDialog.description}</DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={CONVERSATION_STRINGS.noteDialog.placeholder}
          rows={5}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {CONVERSATION_STRINGS.noteDialog.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {CONVERSATION_STRINGS.noteDialog.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
