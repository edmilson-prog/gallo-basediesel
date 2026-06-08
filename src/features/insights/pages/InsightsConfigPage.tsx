import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { IInsightThresholds } from "@/shared/types";
import { DEFAULT_INSIGHT_THRESHOLDS } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

interface IThresholdEditor {
  key: keyof IInsightThresholds;
  label: string;
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
  hint?: string;
}

const PERCENT = (v: number) => `${Math.round(v * 100)}%`;
const DAYS = (v: number) => `${v} dias`;
const CURRENCY = (v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const NUMBER = (v: number) => `${v}`;

const EDITORS: IThresholdEditor[] = [
  {
    key: "marginDropPct",
    label: "Queda mínima de margem por categoria (heurística 1)",
    min: 0.05,
    max: 0.5,
    step: 0.01,
    formatter: PERCENT,
    hint: "Acima deste valor, gera insight crítico de queda de margem.",
  },
  {
    key: "churnSpikePct",
    label: "Alta mínima de churn (heurística 2)",
    min: 0.1,
    max: 1,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "sellerAtRiskMetrics",
    label: "Métricas simultâneas em queda para vendedor em risco (heurística 3)",
    min: 2,
    max: 4,
    step: 1,
    formatter: NUMBER,
  },
  {
    key: "customerAtRiskRatio",
    label: "Fração de `dormantDays` para cliente em risco (heurística 4)",
    min: 0.5,
    max: 1,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "productDeclinePct",
    label: "Queda mínima de vendas por produto (heurística 5)",
    min: 0.15,
    max: 0.7,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "productExcessCoverageDays",
    label: "Cobertura máxima antes de considerar excesso (heurística 6)",
    min: 60,
    max: 365,
    step: 15,
    formatter: DAYS,
  },
  {
    key: "productExcessCapital",
    label: "Capital parado mínimo (heurística 6)",
    min: 1000,
    max: 50_000,
    step: 1000,
    formatter: CURRENCY,
  },
  {
    key: "sdrConversionDropPct",
    label: "Queda mínima na taxa de aceite SDR (heurística 7)",
    min: 0.1,
    max: 0.6,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "metaAtRiskProgress",
    label: "Progresso máximo da meta para risco (heurística 8)",
    min: 0.3,
    max: 0.8,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "metaAtRiskDaysRemaining",
    label: "Dias restantes máximos para meta em risco (heurística 8)",
    min: 3,
    max: 14,
    step: 1,
    formatter: DAYS,
  },
  {
    key: "topSellerOverloadTmrPct",
    label: "Aumento mínimo no intervalo entre pedidos (heurística 9)",
    min: 0.1,
    max: 0.6,
    step: 0.05,
    formatter: PERCENT,
  },
  {
    key: "opportunitySegmentGrowthPct",
    label: "Crescimento mínimo para oportunidade de segmento (heurística 10)",
    min: 0.15,
    max: 1,
    step: 0.05,
    formatter: PERCENT,
  },
];

/**
 * `/app/configuracoes/insights` — Owner-only configuration of the IA Analítica
 * thresholds (PRD-053). Adjusts the per-heuristic sensitivity and the global
 * `insightsEnabled` toggle.
 */
export function InsightsConfigPage() {
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState<IInsightThresholds>(DEFAULT_INSIGHT_THRESHOLDS);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.insightsEnabled);
      setDraft(settings.insightThresholds);
    }
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    if (enabled !== settings.insightsEnabled) return true;
    for (const key of Object.keys(draft) as (keyof IInsightThresholds)[]) {
      if (draft[key] !== settings.insightThresholds[key]) return true;
    }
    return false;
  }, [settings, draft, enabled]);

  if (role !== "Owner") {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title="Apenas Owner"
        description="Esta página fica restrita ao Owner da loja."
        actionLabel="Voltar"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Insights" description="Configure a IA Analítica." />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ insightsEnabled: enabled, insightThresholds: draft }, "insight_config_update");
      toast.success(S.configSaved);
    } catch {
      toast.error("Não foi possível salvar as configurações.");
    }
  };

  const handleReset = () => {
    setDraft(settings.insightThresholds);
    setEnabled(settings.insightsEnabled);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={S.configPageTitle}
        description="Defina sensibilidade das heurísticas e o liga/desliga global do hub de Insights."
      />

      <Card className="space-y-1 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Icon icon="mdi:robot-happy-outline" size={20} className="mt-0.5 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{S.configLlmBannerTitle}</p>
            <p className="text-xs text-muted-foreground">{S.configLlmBannerBody}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="insights-enabled" className="text-sm font-medium">
              {S.configToggleLabel}
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">{S.configToggleHint}</p>
          </div>
          <Switch id="insights-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </Card>

      <Card className="space-y-6 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">{S.configThresholdsTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{S.configThresholdsHint}</p>
        </div>

        <div className="space-y-6">
          {EDITORS.map((editor) => (
            <ThresholdSlider
              key={editor.key}
              label={editor.label}
              hint={editor.hint}
              value={draft[editor.key]}
              min={editor.min}
              max={editor.max}
              step={editor.step}
              formatter={editor.formatter}
              disabled={!enabled}
              onChange={(next) => setDraft((prev) => ({ ...prev, [editor.key]: next }))}
            />
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ThresholdSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  formatter,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="rounded-sm bg-muted/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {formatter(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
