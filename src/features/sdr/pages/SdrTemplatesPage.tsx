import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ISdrTemplate, SdrTemplateTrigger } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { DEFAULT_SDR_TEMPLATES } from "../templates/defaults";

const TRIGGER_LABEL: Record<SdrTemplateTrigger, string> = {
  saudacao: "Saudação inicial",
  identificacao_nome: "Identificação — nome",
  identificacao_empresa: "Identificação — empresa",
  pergunta_necessidade: "Pergunta de necessidade",
  faq_horario: "FAQ — horário",
  faq_entrega: "FAQ — entrega",
  escalacao_humano: "Escalação para humano",
  despedida: "Despedida",
};

const KNOWN_VARIABLES = ["nome", "empresa"];

function extractUsedVariables(text: string): string[] {
  const matches = [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return [...seen];
}

export function SdrTemplatesPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sdrEnabled, setSdrEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings) setSdrEnabled(settings.sdrEnabled);
  }, [settings]);

  const templates = useMemo(() => settings?.sdrTemplates ?? [], [settings]);

  const handleSave = async (template: ISdrTemplate) => {
    if (!settings) return;
    const draftText = drafts[template.id] ?? template.text;
    const usedVars = extractUsedVariables(draftText);
    const unknownVars = usedVars.filter((v) => !KNOWN_VARIABLES.includes(v));
    if (unknownVars.length > 0) {
      toast.warning(
        `Variáveis desconhecidas: ${unknownVars.join(", ")}. Disponíveis: ${KNOWN_VARIABLES.join(", ")}`,
      );
      return;
    }
    const next = settings.sdrTemplates.map((t) =>
      t.id === template.id ? { ...t, text: draftText, variables: usedVars } : t,
    );
    try {
      await update({ sdrTemplates: next }, "sdr.templates.update");
      toast.success(`Template "${TRIGGER_LABEL[template.trigger]}" atualizado.`);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[template.id];
        return copy;
      });
    } catch {
      toast.error("Falha ao salvar o template.");
    }
  };

  const handleReset = async (template: ISdrTemplate) => {
    if (!settings) return;
    const original = DEFAULT_SDR_TEMPLATES.find((t) => t.trigger === template.trigger);
    if (!original) return;
    const next = settings.sdrTemplates.map((t) =>
      t.id === template.id ? { ...t, text: original.text, variables: original.variables } : t,
    );
    try {
      await update({ sdrTemplates: next }, "sdr.templates.reset");
      toast.success(`Template "${TRIGGER_LABEL[template.trigger]}" restaurado para o padrão.`);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[template.id];
        return copy;
      });
    } catch {
      toast.error("Falha ao restaurar o template.");
    }
  };

  const handleToggleEnabled = async (next: boolean) => {
    if (!settings) return;
    setSdrEnabled(next);
    try {
      await update({ sdrEnabled: next }, "sdr.toggle");
      toast.success(next ? "Agente SDR ativado." : "Agente SDR desativado.");
    } catch {
      toast.error("Falha ao alterar o estado do SDR.");
      setSdrEnabled(!next);
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Templates do agente SDR"
        description="Edite as mensagens que o SDR usa em cada momento da conversa. Variáveis suportadas: {{nome}}, {{empresa}}."
      />

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon icon="mdi:robot" className="size-4 text-primary" />
              Agente SDR ativo
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando desativado, o SDR não responde automaticamente nas conversas.
            </p>
          </div>
          <Switch
            checked={sdrEnabled ?? false}
            onCheckedChange={handleToggleEnabled}
            disabled={saving}
            aria-label="Ativar agente SDR"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((template) => {
          const draft = drafts[template.id];
          const dirty = draft !== undefined && draft !== template.text;
          return (
            <Card key={template.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{TRIGGER_LABEL[template.trigger]}</span>
                  <code className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {template.trigger}
                  </code>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor={`tpl-${template.id}`} className="text-xs text-muted-foreground">
                    Texto da mensagem
                  </Label>
                  <Textarea
                    id={`tpl-${template.id}`}
                    value={draft ?? template.text}
                    rows={4}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [template.id]: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Variáveis usadas:</span>
                  {extractUsedVariables(draft ?? template.text).length === 0 ? (
                    <span>—</span>
                  ) : (
                    extractUsedVariables(draft ?? template.text).map((v) => (
                      <code key={v} className="rounded bg-muted px-1.5 py-0.5">
                        {`{{${v}}}`}
                      </code>
                    ))
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReset(template)}
                    disabled={saving}
                  >
                    <Icon icon="mdi:restore" className="size-4" />
                    Restaurar padrão
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(template)}
                    disabled={saving || !dirty}
                  >
                    <Icon icon="mdi:content-save-outline" className="size-4" />
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
