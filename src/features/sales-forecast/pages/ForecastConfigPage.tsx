import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { IForecastConfig, PipelineWeightingMode } from "@/shared/types/forecast";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentStore } from "@/features/multistore";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { Forbidden } from "@/features/rbac/components/Forbidden";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "@/features/admin-settings/components/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/features/admin-settings/hooks/useUnsavedChanges";
import { DEFAULT_FORECAST_CONFIG } from "../engine/defaults";

const WEIGHTING_MODE_OPTIONS: Array<{
  value: PipelineWeightingMode;
  label: string;
  description: string;
}> = [
  {
    value: "temperature",
    label: "Por temperatura (recomendado)",
    description:
      "Pondera cada oportunidade do pipeline pelo peso da temperatura (frio / morno / quente).",
  },
  {
    value: "stage",
    label: "Por estágio do pipeline",
    description: "Usa o peso configurado por estágio do funil. Requer pesos por estágio (Fase 2).",
  },
  {
    value: "hybrid",
    label: "Híbrido (temperatura + estágio)",
    description:
      "Combina o peso da temperatura com o peso do estágio para uma ponderação mais fina.",
  },
];

/** Clamp a number into the [min, max] range, falling back to `fallback` when NaN. */
function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function ForecastConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const storeId = currentStoreId ?? "store-matriz";
  const canView = hasPermission(currentUser, "settings", "view");
  const canEdit = role === "Owner";

  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  const [draft, setDraft] = useState<IForecastConfig | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft(structuredClone(settings.forecast ?? DEFAULT_FORECAST_CONFIG));
    }
  }, [settings]);

  const baseline = useMemo<IForecastConfig | null>(() => {
    if (!settings) return null;
    return settings.forecast ?? DEFAULT_FORECAST_CONFIG;
  }, [settings]);

  const dirty = useMemo(() => {
    if (!baseline || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [baseline, draft]);

  const unsaved = useUnsavedChanges(dirty && canEdit);

  if (!canView) {
    return (
      <Forbidden
        title="Acesso restrito"
        message="A configuração do forecast só está disponível para o Owner."
        actionLabel="Voltar para configurações"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Forecast de Fechamento"
          description="Ajuste fino dos pesos e cenários da projeção determinística de fechamento. PRD-056."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    if (!canEdit) return;
    for (const key of ["frio", "morno", "quente"] as const) {
      const w = draft.temperatureWeights[key];
      if (!Number.isFinite(w) || w < 0 || w > 1) {
        toast.error("Os pesos de temperatura precisam estar entre 0 e 1.");
        return;
      }
    }
    for (const key of ["pessimista", "provavel", "otimista"] as const) {
      const f = draft.scenarioFactors[key];
      if (!Number.isFinite(f) || f <= 0) {
        toast.error("Os fatores de cenário precisam ser positivos.");
        return;
      }
    }
    if (!Number.isInteger(draft.lowConfidenceMinDays) || draft.lowConfidenceMinDays < 0) {
      toast.error("O limite de dias para baixa confiança precisa ser um inteiro não negativo.");
      return;
    }
    try {
      await update({ forecast: draft }, "settings.forecast.update");
      toast.success("Configurações de forecast salvas.");
    } catch {
      toast.error("Não foi possível salvar as configurações de forecast.");
    }
  };

  const handleReset = () => {
    setDraft(structuredClone(baseline ?? DEFAULT_FORECAST_CONFIG));
  };

  const setTemperatureWeight = (
    key: keyof IForecastConfig["temperatureWeights"],
    value: number,
  ) => {
    setDraft({
      ...draft,
      temperatureWeights: {
        ...draft.temperatureWeights,
        [key]: clampNumber(value, 0, 1, 0),
      },
    });
  };

  const setScenarioFactor = (key: keyof IForecastConfig["scenarioFactors"], value: number) => {
    setDraft({
      ...draft,
      scenarioFactors: {
        ...draft.scenarioFactors,
        [key]: clampNumber(value, 0, 10, 1),
      },
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Forecast de Fechamento"
        description="Ajuste fino dos pesos e cenários da projeção determinística de fechamento. PRD-056."
      />

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Icon icon="mdi:information-outline" className="mt-0.5 size-4 shrink-0" />
          <span>
            Projeção determinística baseada em ritmo + pipeline. Modelo preditivo (ML) com
            sazonalidade disponível na Fase 2.
          </span>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:eye-outline" className="size-4" />
            <span>Você está em modo de visualização. A edição requer permissão de Owner.</span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:thermometer" className="size-5 text-primary" />
            Pesos por temperatura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Peso aplicado a cada oportunidade do pipeline conforme a temperatura. Valores entre 0
            (irrelevante) e 1 (peso total).
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Frio</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.temperatureWeights.frio}
                onChange={(e) => setTemperatureWeight("frio", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Morno</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.temperatureWeights.morno}
                onChange={(e) => setTemperatureWeight("morno", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Quente</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.temperatureWeights.quente}
                onChange={(e) => setTemperatureWeight("quente", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:chart-bell-curve-cumulative" className="size-5 text-primary" />
            Fatores de cenário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Multiplicadores aplicados sobre o cenário provável para derivar pessimista e otimista. O
            provável é sempre 1.0.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Pessimista</Label>
              <Input
                type="number"
                min={0}
                step={0.05}
                value={draft.scenarioFactors.pessimista}
                onChange={(e) => setScenarioFactor("pessimista", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Provável</Label>
              <Input
                type="number"
                value={draft.scenarioFactors.provavel}
                readOnly
                disabled
                aria-label="Fator do cenário provável (fixo em 1.0)"
              />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fixo em 1.0
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Otimista</Label>
              <Input
                type="number"
                min={0}
                step={0.05}
                value={draft.scenarioFactors.otimista}
                onChange={(e) => setScenarioFactor("otimista", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:tune-variant" className="size-5 text-primary" />
            Ponderação do pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Modo de ponderação</Label>
            <Select
              value={draft.pipelineWeightingMode}
              onValueChange={(v) =>
                setDraft({ ...draft, pipelineWeightingMode: v as PipelineWeightingMode })
              }
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHTING_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                WEIGHTING_MODE_OPTIONS.find((o) => o.value === draft.pipelineWeightingMode)
                  ?.description
              }
            </p>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label className="text-sm">Dias mínimos para confiança plena</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={draft.lowConfidenceMinDays}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  lowConfidenceMinDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                })
              }
              disabled={!canEdit}
              className="md:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Abaixo desta quantidade de dias decorridos no período, a projeção é sinalizada como
              baixa confiança.
            </p>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
