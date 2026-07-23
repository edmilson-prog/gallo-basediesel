import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ICustomer } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider } from "@/providers/data";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

const DORMANT_MIN = 30;
const DORMANT_MAX = 180;
const LOST_MIN = 180;
const LOST_MAX = 720;

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

interface ICounts {
  dormantBeingSimulated: number;
  lostBeingSimulated: number;
}

function simulateCounts(customers: ICustomer[], dormantDays: number, lostDays: number): ICounts {
  let dormant = 0;
  let lost = 0;
  for (const c of customers) {
    if (c.status === "perdido") continue;
    const elapsed = daysSince(c.lastPurchaseAt);
    if (elapsed === null) continue;
    if (elapsed >= lostDays) lost += 1;
    else if (elapsed >= dormantDays) dormant += 1;
  }
  return { dormantBeingSimulated: dormant, lostBeingSimulated: lost };
}

export function LifecycleSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const customersProvider = useCustomersProvider();
  const [allCustomers, setAllCustomers] = useState<ICustomer[]>([]);
  const [draftDormant, setDraftDormant] = useState(60);
  const [draftLost, setDraftLost] = useState(180);

  useEffect(() => {
    let cancelled = false;
    customersProvider.list({ storeId, pageSize: FETCH_ALL_PAGE_SIZE }).then((res) => {
      if (!cancelled) setAllCustomers(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [customersProvider, storeId]);

  useEffect(() => {
    if (settings) {
      setDraftDormant(settings.lifecycleThresholds.dormantDays);
      setDraftLost(settings.lifecycleThresholds.lostDays);
    }
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      draftDormant !== settings.lifecycleThresholds.dormantDays ||
      draftLost !== settings.lifecycleThresholds.lostDays
    );
  }, [settings, draftDormant, draftLost]);

  const unsaved = useUnsavedChanges(dirty);

  const preview = useMemo(
    () => simulateCounts(allCustomers, draftDormant, draftLost),
    [allCustomers, draftDormant, draftLost],
  );

  const current = useMemo(() => {
    if (!settings) return null;
    return simulateCounts(
      allCustomers,
      settings.lifecycleThresholds.dormantDays,
      settings.lifecycleThresholds.lostDays,
    );
  }, [allCustomers, settings]);

  const handleSave = async () => {
    if (!settings) return;
    if (draftLost <= draftDormant) {
      toast.error("O limiar de perdido precisa ser maior que o de dormente.");
      return;
    }
    try {
      await update(
        {
          lifecycleThresholds: { dormantDays: draftDormant, lostDays: draftLost },
        },
        "settings.lifecycle.update",
      );
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => {
    if (!settings) return;
    setDraftDormant(settings.lifecycleThresholds.dormantDays);
    setDraftLost(settings.lifecycleThresholds.lostDays);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Ciclo de vida do cliente"
          description="Defina quando um cliente passa a ser considerado dormente ou perdido."
        />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ciclo de vida do cliente"
        description="Defina quando um cliente passa a ser considerado dormente ou perdido. As mudanças refletem na ficha (PRD-012) e nos alertas do painel do gestor (PRD-014)."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <ThresholdSlider
          label="Dias sem compra para considerar dormente"
          icon="mdi:account-clock-outline"
          value={draftDormant}
          min={DORMANT_MIN}
          max={DORMANT_MAX}
          step={5}
          onChange={setDraftDormant}
          current={settings.lifecycleThresholds.dormantDays}
        />
        <ThresholdSlider
          label="Dias sem compra para considerar perdido"
          icon="mdi:account-off-outline"
          value={draftLost}
          min={LOST_MIN}
          max={LOST_MAX}
          step={15}
          onChange={setDraftLost}
          current={settings.lifecycleThresholds.lostDays}
        />

        <div className="rounded-md border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pré-visualização do impacto
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PreviewStat
              icon="mdi:account-clock-outline"
              label="Dormentes (simulado)"
              value={preview.dormantBeingSimulated}
              current={current?.dormantBeingSimulated}
            />
            <PreviewStat
              icon="mdi:account-off-outline"
              label="Perdidos (simulado)"
              value={preview.lostBeingSimulated}
              current={current?.lostBeingSimulated}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Cálculo baseado em <strong>{allCustomers.length}</strong> clientes da loja, considerando
            a data da última compra.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
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

interface IThresholdSliderProps {
  label: string;
  icon: string;
  value: number;
  current: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}

function ThresholdSlider({
  label,
  icon,
  value,
  current,
  min,
  max,
  step,
  onChange,
}: IThresholdSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon icon={icon} size={18} className="text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">dias</p>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{min} dias</span>
        <span>Atual: {current}</span>
        <span>{max} dias</span>
      </div>
    </div>
  );
}

function PreviewStat({
  icon,
  label,
  value,
  current,
}: {
  icon: string;
  label: string;
  value: number;
  current?: number;
}) {
  const delta = current != null ? value - current : null;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={icon} size={14} />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span
            className={
              delta > 0
                ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                : "text-xs font-medium text-emerald-600 dark:text-emerald-400"
            }
          >
            {delta > 0 ? `+${delta}` : delta} vs atual
          </span>
        )}
        {delta === 0 && (
          <span className="text-xs font-medium text-muted-foreground">sem mudança</span>
        )}
      </div>
    </div>
  );
}
