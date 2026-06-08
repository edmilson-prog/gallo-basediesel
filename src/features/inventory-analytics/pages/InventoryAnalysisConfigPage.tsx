import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IInventoryAnalysisSettings } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { useCurrentStore } from "@/features/multistore";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

type Draft = IInventoryAnalysisSettings;

function pickDraft(s: IInventoryAnalysisSettings): Draft {
  return {
    consumptionWindowDays: s.consumptionWindowDays,
    targetCoverageDays: s.targetCoverageDays,
    excessCoverageDays: s.excessCoverageDays,
  };
}

export function InventoryAnalysisConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDraft(pickDraft(settings.inventoryAnalysisSettings));
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(pickDraft(settings.inventoryAnalysisSettings)) !== JSON.stringify(draft);
  }, [settings, draft]);

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.configTitle} description={S.configSubtitle} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ inventoryAnalysisSettings: draft }, "settings.inventory.update");
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(S.configSaved, { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error(S.configSaveError);
    }
  };

  const handleReset = () => setDraft(pickDraft(settings.inventoryAnalysisSettings));

  return (
    <div className="space-y-6">
      <SectionHeader title={S.configTitle} description={S.configSubtitle} />

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        <Icon icon="mdi:information-outline" size={14} className="mr-1 inline align-text-bottom" />
        {S.configBanner}
      </div>

      <Card className="space-y-6 p-5">
        <DaysRow
          label={S.configWindow}
          help={S.configWindowHelp}
          value={draft.consumptionWindowDays}
          min={14}
          max={365}
          onChange={(v) => setDraft({ ...draft, consumptionWindowDays: v })}
        />
        <DaysRow
          label={S.configTarget}
          help={S.configTargetHelp}
          value={draft.targetCoverageDays}
          min={7}
          max={120}
          onChange={(v) => setDraft({ ...draft, targetCoverageDays: v })}
        />
        <DaysRow
          label={S.configExcess}
          help={S.configExcessHelp}
          value={draft.excessCoverageDays}
          min={60}
          max={720}
          onChange={(v) => setDraft({ ...draft, excessCoverageDays: v })}
        />
      </Card>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
          {S.configDiscard}
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : S.configSave}
        </Button>
      </div>
    </div>
  );
}

interface IDaysRowProps {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

function DaysRow({ label, help, value, min, max, onChange }: IDaysRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <Input
            type="number"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
            className="h-9 w-24 text-right tabular-nums"
          />
          <span className="text-xs text-muted-foreground">dias</span>
        </div>
      </div>
      <Slider
        className="mt-3"
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(values) => onChange(values[0] ?? value)}
      />
    </div>
  );
}
