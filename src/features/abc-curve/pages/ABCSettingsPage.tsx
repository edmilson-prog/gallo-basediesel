import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { formatBRLCompact, formatPercent } from "@/shared/utils/format";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "@/features/admin-settings/components/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/features/admin-settings/hooks/useUnsavedChanges";
import { resolveABCWindow, DEFAULT_ABC_FILTERS } from "../hooks/useABCFilters";
import { useABCClassification } from "../hooks/useABCClassification";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

const PERIOD_MIN = 3;
const PERIOD_MAX = 24;
const CUTOFF_A_MIN = 0.7;
const CUTOFF_A_MAX = 0.9;
const CUTOFF_B_MIN = 0.9;
const CUTOFF_B_MAX = 0.99;

/**
 * Admin settings page for the ABC curve (`/app/configuracoes/curva-abc`).
 * Owner-only. Allows tuning the rolling window and the class cutoffs, with a
 * live preview of how the distribution changes vs the current configuration.
 */
export function ABCSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();

  const [draftPeriod, setDraftPeriod] = useState(12);
  const [draftClassA, setDraftClassA] = useState(0.8);
  const [draftClassB, setDraftClassB] = useState(0.95);

  useEffect(() => {
    if (settings?.abcCurveSettings) {
      setDraftPeriod(settings.abcCurveSettings.periodMonths);
      setDraftClassA(settings.abcCurveSettings.classAThreshold);
      setDraftClassB(settings.abcCurveSettings.classBThreshold);
    }
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings?.abcCurveSettings) return false;
    const cur = settings.abcCurveSettings;
    return (
      draftPeriod !== cur.periodMonths ||
      draftClassA !== cur.classAThreshold ||
      draftClassB !== cur.classBThreshold
    );
  }, [settings, draftPeriod, draftClassA, draftClassB]);

  const unsaved = useUnsavedChanges(dirty);

  // Preview metrics using the current (saved) settings.
  const previewFilters = useMemo(
    () => ({ ...DEFAULT_ABC_FILTERS, period: `${draftPeriod}m` as const }),
    [draftPeriod],
  );
  const currentWindow = useMemo(
    () => resolveABCWindow({ ...DEFAULT_ABC_FILTERS, period: "12m" }, "current"),
    [],
  );
  const previousWindow = useMemo(
    () => resolveABCWindow({ ...DEFAULT_ABC_FILTERS, period: "12m" }, "previous"),
    [],
  );
  void previewFilters; // satisfy unused — used implicitly by storeId scope

  const currentRun = useABCClassification({
    window: currentWindow,
    previousWindow,
    scope: { storeId },
  });
  const draftRun = useABCClassification({
    window: currentWindow,
    previousWindow,
    scope: { storeId },
    settingsOverride: {
      periodMonths: draftPeriod,
      classAThreshold: draftClassA,
      classBThreshold: draftClassB,
    },
  });

  const handleSave = async () => {
    if (!settings?.abcCurveSettings) return;
    if (draftClassB <= draftClassA) {
      toast.error(S.adminInvalidThresholds);
      return;
    }
    try {
      await update(
        {
          abcCurveSettings: {
            periodMonths: draftPeriod,
            classAThreshold: draftClassA,
            classBThreshold: draftClassB,
          },
        },
        "settings.abcCurve.update",
      );
      toast.success(S.adminSavingToast);
    } catch {
      toast.error(S.adminSavingError);
    }
  };

  const handleReset = () => {
    if (!settings?.abcCurveSettings) return;
    setDraftPeriod(settings.abcCurveSettings.periodMonths);
    setDraftClassA(settings.abcCurveSettings.classAThreshold);
    setDraftClassB(settings.abcCurveSettings.classBThreshold);
  };

  const handleRecalculate = () => {
    void queryClient.invalidateQueries({ queryKey: ["abc"] });
    toast.success(S.adminRecalculateToast);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.adminTitle} description={S.adminDescription} />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={S.adminTitle} description={S.adminDescription} />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:calendar-range" size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">{S.adminPeriodMonthsLabel}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">{draftPeriod}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {S.adminPeriodMonthsUnit}
              </p>
            </div>
          </div>
          <Slider
            value={[draftPeriod]}
            min={PERIOD_MIN}
            max={PERIOD_MAX}
            step={1}
            onValueChange={(v) => setDraftPeriod(v[0] ?? draftPeriod)}
            aria-label={S.adminPeriodMonthsLabel}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:alpha-a-circle-outline" size={18} className="text-emerald-600" />
              <span className="text-sm font-medium">{S.adminClassALabel}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">
                {Math.round(draftClassA * 100)}%
              </p>
            </div>
          </div>
          <Slider
            value={[Math.round(draftClassA * 100)]}
            min={Math.round(CUTOFF_A_MIN * 100)}
            max={Math.round(CUTOFF_A_MAX * 100)}
            step={1}
            onValueChange={(v) => setDraftClassA((v[0] ?? Math.round(draftClassA * 100)) / 100)}
            aria-label={S.adminClassALabel}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:alpha-b-circle-outline" size={18} className="text-amber-600" />
              <span className="text-sm font-medium">{S.adminClassBLabel}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">
                {Math.round(draftClassB * 100)}%
              </p>
            </div>
          </div>
          <Slider
            value={[Math.round(draftClassB * 100)]}
            min={Math.round(CUTOFF_B_MIN * 100)}
            max={Math.round(CUTOFF_B_MAX * 100)}
            step={1}
            onValueChange={(v) => setDraftClassB((v[0] ?? Math.round(draftClassB * 100)) / 100)}
            aria-label={S.adminClassBLabel}
          />
        </div>

        <p className="text-xs text-muted-foreground">{S.adminCutoffsHelp}</p>

        <Card className="space-y-3 bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {S.adminPreviewTitle}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <PreviewClass
              klass="A"
              current={currentRun.metrics?.byClass.A}
              draft={draftRun.metrics?.byClass.A}
              isLoading={currentRun.isLoading || draftRun.isLoading}
            />
            <PreviewClass
              klass="B"
              current={currentRun.metrics?.byClass.B}
              draft={draftRun.metrics?.byClass.B}
              isLoading={currentRun.isLoading || draftRun.isLoading}
            />
            <PreviewClass
              klass="C"
              current={currentRun.metrics?.byClass.C}
              draft={draftRun.metrics?.byClass.C}
              isLoading={currentRun.isLoading || draftRun.isLoading}
            />
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={handleRecalculate} className="gap-1">
            <Icon icon="mdi:refresh" size={14} />
            {S.adminRecalculateButton}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            {S.adminDiscard}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : S.adminSave}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}

function PreviewClass({
  klass,
  current,
  draft,
  isLoading,
}: {
  klass: "A" | "B" | "C";
  current?: { count: number; revenue: number; revenuePct: number };
  draft?: { count: number; revenue: number; revenuePct: number };
  isLoading?: boolean;
}) {
  const delta = current && draft ? draft.count - current.count : 0;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Classe {klass}
      </p>
      {isLoading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {draft?.count.toLocaleString("pt-BR") ?? "—"}
            {delta !== 0 && (
              <span
                className={
                  delta > 0
                    ? "ml-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                    : "ml-2 text-xs font-medium text-amber-600 dark:text-amber-400"
                }
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBRLCompact(draft?.revenue ?? 0)} · {formatPercent(draft?.revenuePct ?? 0)}
          </p>
        </>
      )}
    </div>
  );
}
