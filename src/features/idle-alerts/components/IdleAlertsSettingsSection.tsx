import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ID, IIdleAlertsSettings } from "@/shared/types";
import { useIdleAlertsSettings } from "../hooks/useIdleAlertsSettings";

const HOURS_MIN = 1;
const HOURS_MAX = 200;

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return HOURS_MIN;
  return Math.min(HOURS_MAX, Math.max(HOURS_MIN, Math.round(value)));
}

const HOUR_FIELDS = [
  ["level1Hours", "Atenção (h úteis)"],
  ["level2Hours", "Alerta (h úteis)"],
  ["level3Hours", "Crítica (h úteis)"],
] as const;

export interface IIdleAlertsSettingsSectionProps {
  storeId: ID | null;
}

/**
 * Per-store idle-alert thresholds card (spec 2026-07-16). Mounted on the same
 * screen as `AlertSettingsModal`, gated to the same role (Owner).
 */
export function IdleAlertsSettingsSection({ storeId }: IIdleAlertsSettingsSectionProps) {
  const { settings, loading, saving, update } = useIdleAlertsSettings(storeId);
  const [draft, setDraft] = useState<IIdleAlertsSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await update({
        enabled: draft.enabled,
        level1Hours: clampHours(draft.level1Hours),
        level2Hours: clampHours(draft.level2Hours),
        level3Hours: clampHours(draft.level3Hours),
        notifyManagerOnLevel3: draft.notifyManagerOnLevel3,
      });
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Alertas de ociosidade</h3>
          <p className="text-xs text-muted-foreground">
            Cobra o atendente quando o cliente aguarda resposta (horas úteis da agenda de cada um).
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          aria-label="Ativar alertas de ociosidade"
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {HOUR_FIELDS.map(([field, label]) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`idle-${field}`} className="text-xs">
              {label}
            </Label>
            <Input
              id={`idle-${field}`}
              type="number"
              min={HOURS_MIN}
              max={HOURS_MAX}
              value={draft[field]}
              disabled={!draft.enabled}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [field]: clampHours(Number(e.target.value)) }))
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.notifyManagerOnLevel3}
            disabled={!draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, notifyManagerOnLevel3: v }))}
            aria-label="Notificar gestor no nível crítico"
          />
          <span className="text-xs text-muted-foreground">Notificar gestor no nível crítico</span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          Salvar
        </Button>
      </div>
    </section>
  );
}
