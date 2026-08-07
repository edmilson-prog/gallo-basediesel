import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { SDR_TEMPLATE_VARIABLES_REGISTRY } from "../config/groups";

export interface ISdrTemplateEditorProps {
  id: string;
  title: string;
  triggerCode: string;
  text: string;
  defaultText: string;
  saving: boolean;
  readOnly: boolean;
  /** Example variable values used to render the live preview. */
  previewVariables: Record<string, string>;
  onChange: (text: string) => void;
  onSave: () => void;
  onReset: () => void;
}

function extractVariables(text: string): string[] {
  const matches = [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return [...seen];
}

function renderPreview(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function HighlightedPreview({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { type: "text" | "var"; value: string }[] = [];
    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        out.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      out.push({ type: "var", value: match[0] });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
      out.push({ type: "text", value: text.slice(lastIndex) });
    }
    return out;
  }, [text]);

  return (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {parts.map((part, idx) =>
        part.type === "var" ? (
          <span key={idx} className="rounded bg-primary/10 px-1 text-primary" title="Variável">
            {part.value}
          </span>
        ) : (
          <span key={idx}>{part.value}</span>
        ),
      )}
    </pre>
  );
}

export function SdrTemplateEditor({
  id,
  title,
  triggerCode,
  text,
  defaultText,
  saving,
  readOnly,
  previewVariables,
  onChange,
  onSave,
  onReset,
}: ISdrTemplateEditorProps) {
  const usedVars = extractVariables(text);
  const dirty = text !== defaultText;
  const preview = renderPreview(text, previewVariables);

  return (
    <Card className="space-y-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <code className="mt-0.5 inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            {triggerCode}
          </code>
        </div>
        {dirty && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-severity-warning">
            Não salvo
          </span>
        )}
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`sdr-tpl-${id}`} className="text-xs text-muted-foreground">
            Texto da mensagem
          </Label>
          <Textarea
            id={`sdr-tpl-${id}`}
            value={text}
            rows={6}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            className={cn("font-mono text-xs", readOnly && "opacity-70")}
          />
          {usedVars.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>Variáveis usadas:</span>
              {usedVars.map((v) => (
                <code key={v} className="rounded bg-muted px-1 py-0.5">{`{{${v}}}`}</code>
              ))}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
          <HighlightedPreview text={text} />
          <div className="rounded-md border border-dashed bg-muted/10 p-3 text-xs text-foreground">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Renderizado
            </p>
            <p className="whitespace-pre-wrap break-words">{preview}</p>
          </div>
        </div>
      </div>

      {usedVars.length > 0 && (
        <div className="rounded-md border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Glossário de variáveis</p>
          <ul className="mt-1 space-y-1">
            {usedVars.map((v) => (
              <li key={v} className="flex gap-2">
                <code className="font-mono text-primary">{`{{${v}}}`}</code>
                <span>{SDR_TEMPLATE_VARIABLES_REGISTRY[v] ?? "Variável personalizada."}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={saving || !dirty}
            className="gap-1"
          >
            <Icon icon="mdi:restore" size={14} />
            Restaurar padrão
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={saving || !dirty}
            className="gap-1"
          >
            <Icon icon="mdi:content-save-outline" size={14} />
            Salvar
          </Button>
        </div>
      )}
    </Card>
  );
}
