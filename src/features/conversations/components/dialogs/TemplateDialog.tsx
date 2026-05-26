import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import {
  HSM_TEMPLATES,
  renderTemplate,
  templateReady,
  type IHsmTemplate,
} from "../../utils/hsmTemplates";

export interface ITemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rendered: string) => Promise<void> | void;
}

export function TemplateDialog({ open, onOpenChange, onConfirm }: ITemplateDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(HSM_TEMPLATES[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const template = useMemo<IHsmTemplate | undefined>(
    () => HSM_TEMPLATES.find((t) => t.id === selectedId),
    [selectedId],
  );

  const preview = template ? renderTemplate(template, values) : "";
  const ready = template ? templateReady(template, values) : false;

  const handleConfirm = async () => {
    if (!template || !ready) return;
    setSending(true);
    try {
      const finalText =
        template.quickReplies && template.quickReplies.length > 0
          ? `${preview}\n[botões] ${template.quickReplies.join(" | ")}`
          : preview;
      await onConfirm(finalText);
      onOpenChange(false);
      setValues({});
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{CONVERSATION_STRINGS.templateDialog.title}</DialogTitle>
          <DialogDescription>{CONVERSATION_STRINGS.templateDialog.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-select">
              {CONVERSATION_STRINGS.templateDialog.selectTemplate}
            </Label>
            <Select
              value={selectedId}
              onValueChange={(v) => {
                setSelectedId(v);
                setValues({});
              }}
            >
              <SelectTrigger id="template-select">
                <SelectValue placeholder={CONVERSATION_STRINGS.templateDialog.selectTemplate} />
              </SelectTrigger>
              <SelectContent>
                {HSM_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {template && template.variables.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {CONVERSATION_STRINGS.templateDialog.variablesTitle}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {template.variables.map((v) => (
                  <div key={v} className="space-y-1">
                    <Label htmlFor={`tpl-var-${v}`} className="text-xs">
                      {v}
                    </Label>
                    <Input
                      id={`tpl-var-${v}`}
                      value={values[v] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                      placeholder={CONVERSATION_STRINGS.templateDialog.variablePlaceholder(v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {template && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {CONVERSATION_STRINGS.templateDialog.preview}
              </p>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {CONVERSATION_STRINGS.templateDialog.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={!ready || sending}>
            {CONVERSATION_STRINGS.templateDialog.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
