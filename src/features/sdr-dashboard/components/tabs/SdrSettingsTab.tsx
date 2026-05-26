import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Icon } from "@/components/Icon";
import type { IPlatformSettings } from "@/shared/types";

export interface ISdrSettingsTabProps {
  settings: IPlatformSettings | null;
  loading: boolean;
  saving: boolean;
  update: (
    patch: Partial<IPlatformSettings>,
    auditAction?: string,
  ) => Promise<IPlatformSettings | null>;
  canEdit: boolean;
  onJumpToTemplates: () => void;
}

interface IDraftSettings {
  sdrEnabled: boolean;
  sdrQuoteValidityDays: number;
  sdrAutoDiscountPct: number;
  escalationQueueTimeoutMinutesUrgent: number;
  escalationQueueTimeoutMinutesNormal: number;
  escalationUrgentBroadcastDelaySeconds: number;
}

function pickDraft(settings: IPlatformSettings): IDraftSettings {
  return {
    sdrEnabled: settings.sdrEnabled,
    sdrQuoteValidityDays: settings.sdrQuoteValidityDays,
    sdrAutoDiscountPct: Math.round(settings.sdrAutoDiscountPct * 100),
    escalationQueueTimeoutMinutesUrgent: settings.escalationQueueTimeoutMinutesUrgent,
    escalationQueueTimeoutMinutesNormal: settings.escalationQueueTimeoutMinutesNormal,
    escalationUrgentBroadcastDelaySeconds: settings.escalationUrgentBroadcastDelaySeconds,
  };
}

function diffSummary(before: IDraftSettings, after: IDraftSettings): string[] {
  const changes: string[] = [];
  if (before.sdrEnabled !== after.sdrEnabled) {
    changes.push(`SDR ${after.sdrEnabled ? "ativado" : "desativado"}`);
  }
  if (before.sdrQuoteValidityDays !== after.sdrQuoteValidityDays) {
    changes.push(
      `Validade do orçamento: ${before.sdrQuoteValidityDays}d → ${after.sdrQuoteValidityDays}d`,
    );
  }
  if (before.sdrAutoDiscountPct !== after.sdrAutoDiscountPct) {
    changes.push(
      `Desconto autorizado: ${before.sdrAutoDiscountPct}% → ${after.sdrAutoDiscountPct}%`,
    );
  }
  if (
    before.escalationQueueTimeoutMinutesUrgent !== after.escalationQueueTimeoutMinutesUrgent
  ) {
    changes.push(
      `Timeout urgent: ${before.escalationQueueTimeoutMinutesUrgent}min → ${after.escalationQueueTimeoutMinutesUrgent}min`,
    );
  }
  if (
    before.escalationQueueTimeoutMinutesNormal !== after.escalationQueueTimeoutMinutesNormal
  ) {
    changes.push(
      `Timeout normal: ${before.escalationQueueTimeoutMinutesNormal}min → ${after.escalationQueueTimeoutMinutesNormal}min`,
    );
  }
  if (
    before.escalationUrgentBroadcastDelaySeconds !==
    after.escalationUrgentBroadcastDelaySeconds
  ) {
    changes.push(
      `Broadcast urgent após: ${before.escalationUrgentBroadcastDelaySeconds}s → ${after.escalationUrgentBroadcastDelaySeconds}s`,
    );
  }
  return changes;
}

export function SdrSettingsTab({
  settings,
  loading,
  saving,
  update,
  canEdit,
  onJumpToTemplates,
}: ISdrSettingsTabProps) {
  const [draft, setDraft] = useState<IDraftSettings | null>(null);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);

  useEffect(() => {
    if (settings) setDraft(pickDraft(settings));
  }, [settings]);

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const original = pickDraft(settings);
  const changes = diffSummary(original, draft);
  const dirty = changes.length > 0;
  const turningOff = original.sdrEnabled && !draft.sdrEnabled;

  const handleSave = async () => {
    if (turningOff) {
      setConfirmDisableOpen(true);
      return;
    }
    await persist();
  };

  const persist = async () => {
    try {
      await update(
        {
          sdrEnabled: draft.sdrEnabled,
          sdrQuoteValidityDays: draft.sdrQuoteValidityDays,
          sdrAutoDiscountPct: draft.sdrAutoDiscountPct / 100,
          escalationQueueTimeoutMinutesUrgent: draft.escalationQueueTimeoutMinutesUrgent,
          escalationQueueTimeoutMinutesNormal: draft.escalationQueueTimeoutMinutesNormal,
          escalationUrgentBroadcastDelaySeconds: draft.escalationUrgentBroadcastDelaySeconds,
        },
        "sdr.dashboard.settings.update",
      );
      toast.success("Configurações salvas.", {
        description: changes.join(" · "),
      });
    } catch {
      toast.error("Falha ao salvar configurações.");
    } finally {
      setConfirmDisableOpen(false);
    }
  };

  const set = <K extends keyof IDraftSettings>(key: K, value: IDraftSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Configurações em modo leitura. Edição requer permissão de Owner.
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:robot-outline" size={18} className="text-primary" />
            Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Agente SDR ativo</Label>
              <p className="text-xs text-muted-foreground">
                Quando desligado, novas conversas são direcionadas direto para vendedores humanos.
              </p>
            </div>
            <Switch
              checked={draft.sdrEnabled}
              onCheckedChange={(v) => set("sdrEnabled", v)}
              disabled={!canEdit || saving}
              aria-label="Toggle SDR ativo"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:file-document-outline" size={18} className="text-primary" />
            Orçamento automático (PRD-022)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Validade padrão</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.sdrQuoteValidityDays} dias
              </span>
            </div>
            <Slider
              value={[draft.sdrQuoteValidityDays]}
              onValueChange={([v]) => set("sdrQuoteValidityDays", v ?? draft.sdrQuoteValidityDays)}
              min={1}
              max={30}
              step={1}
              disabled={!canEdit || saving}
              className="mt-3"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Desconto autorizado</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.sdrAutoDiscountPct}%
              </span>
            </div>
            <Slider
              value={[draft.sdrAutoDiscountPct]}
              onValueChange={([v]) => set("sdrAutoDiscountPct", v ?? draft.sdrAutoDiscountPct)}
              min={0}
              max={10}
              step={1}
              disabled={!canEdit || saving}
              className="mt-3"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Limite que o SDR pode aplicar automaticamente sem aprovação humana.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon
              icon="mdi:account-arrow-right-outline"
              size={18}
              className="text-primary"
            />
            Escalonamento (PRD-023)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Timeout fila urgente</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.escalationQueueTimeoutMinutesUrgent} min
              </span>
            </div>
            <Slider
              value={[draft.escalationQueueTimeoutMinutesUrgent]}
              onValueChange={([v]) =>
                set(
                  "escalationQueueTimeoutMinutesUrgent",
                  v ?? draft.escalationQueueTimeoutMinutesUrgent,
                )
              }
              min={1}
              max={30}
              step={1}
              disabled={!canEdit || saving}
              className="mt-3"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Timeout fila normal</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.escalationQueueTimeoutMinutesNormal} min
              </span>
            </div>
            <Slider
              value={[draft.escalationQueueTimeoutMinutesNormal]}
              onValueChange={([v]) =>
                set(
                  "escalationQueueTimeoutMinutesNormal",
                  v ?? draft.escalationQueueTimeoutMinutesNormal,
                )
              }
              min={5}
              max={60}
              step={5}
              disabled={!canEdit || saving}
              className="mt-3"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Tempo antes do broadcast urgente</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.escalationUrgentBroadcastDelaySeconds}s
              </span>
            </div>
            <Slider
              value={[draft.escalationUrgentBroadcastDelaySeconds]}
              onValueChange={([v]) =>
                set(
                  "escalationUrgentBroadcastDelaySeconds",
                  v ?? draft.escalationUrgentBroadcastDelaySeconds,
                )
              }
              min={10}
              max={120}
              step={5}
              disabled={!canEdit || saving}
              className="mt-3"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:message-text-outline" size={18} className="text-primary" />
            Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Edite todos os templates (saudação, FAQ, orçamento, escalação) em um lugar.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onJumpToTemplates}
            className="mt-3 gap-1"
          >
            <Icon icon="mdi:arrow-right" size={14} />
            Ir para aba Templates
          </Button>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button
            type="button"
            size="lg"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="gap-2 shadow-lg"
          >
            <Icon icon="mdi:content-save-outline" size={16} />
            {dirty ? `Salvar (${changes.length}) alteraç${changes.length === 1 ? "ão" : "ões"}` : "Salvo"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar desligar o SDR?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as novas conversas passarão direto para vendedores humanos. Conversas em
              andamento com o SDR não são afetadas. Você pode reativar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void persist()}>
              Desligar SDR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
