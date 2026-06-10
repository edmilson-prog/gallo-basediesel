import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IMessageTemplate } from "@/shared/types";
import { useMessageTemplatesProvider } from "@/providers/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { renderTemplate } from "../engine/render";

export interface ITemplatePickerSelection {
  templateId: string;
  templateName: string;
  languageCode: string;
  variables: string[];
  /** Rendered body — used as the message text persisted alongside the send. */
  renderedText: string;
}

export interface ITemplatePickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(selection: ITemplatePickerSelection): void;
}

/**
 * HSM template picker (PRD-116 RF-040..045) — opened by the conversation
 * screen when a send bounces with TEMPLATE_REQUIRED (outside the Meta 24h
 * window). Lists active+approved templates, collects variables with labeled
 * inputs and live preview, then hands the selection back to the caller.
 */
export function TemplatePicker({ open, onOpenChange, onSelect }: ITemplatePickerProps) {
  const provider = useMessageTemplatesProvider();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IMessageTemplate | null>(null);
  const [variables, setVariables] = useState<string[]>([]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["message-templates", "usable"],
    queryFn: () => provider.list({ usableOnly: true }),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (template) =>
        template.displayName.toLowerCase().includes(term) ||
        template.metaTemplateName.toLowerCase().includes(term),
    );
  }, [templates, search]);

  const allFilled =
    selected !== null &&
    variables.length === selected.variableCount &&
    variables.every((value) => value.trim().length > 0);

  const preview = useMemo(() => {
    if (!selected || !allFilled) return null;
    try {
      return renderTemplate(selected, variables).text;
    } catch {
      return null;
    }
  }, [selected, variables, allFilled]);

  function pick(template: IMessageTemplate) {
    setSelected(template);
    setVariables(Array.from({ length: template.variableCount }, () => ""));
  }

  function confirm() {
    if (!selected || !preview) return;
    onSelect({
      templateId: selected.id,
      templateName: selected.metaTemplateName,
      languageCode: selected.metaLanguageCode,
      variables,
      renderedText: preview,
    });
    onOpenChange(false);
    setSelected(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar template HSM</DialogTitle>
          <DialogDescription>
            Fora da janela de 24h só é possível enviar templates aprovados pela Meta.
          </DialogDescription>
        </DialogHeader>

        {selected === null ? (
          <div className="space-y-3">
            <Input
              placeholder="Buscar template…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum template aprovado disponível — cadastre em Configurações → Templates
                  WhatsApp.
                </p>
              ) : (
                filtered.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => pick(template)}
                    className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p className="text-sm font-medium text-foreground">{template.displayName}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {template.bodyTemplate}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon icon="mdi:arrow-left" size={14} />
              Voltar à lista
            </button>
            <p className="text-sm font-medium text-foreground">{selected.displayName}</p>
            {selected.variableLabels.map((label, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`tpl-var-${i}`}>{label || `Variável {{${i + 1}}}`}</Label>
                <Input
                  id={`tpl-var-${i}`}
                  value={variables[i] ?? ""}
                  onChange={(e) =>
                    setVariables((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                />
              </div>
            ))}
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Pré-visualização</p>
              {preview ?? (
                <span className="text-muted-foreground">Preencha todas as variáveis…</span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!allFilled || !preview} onClick={confirm}>
            <Icon icon="mdi:send" size={16} />
            Enviar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
