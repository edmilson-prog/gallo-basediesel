import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrentStore } from "@/features/multistore";
import { useSdrPilotSettingsProvider } from "@/providers/data";
import type { ISdrPilotSettings } from "@/shared/types";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiSdrTab() {
  const { currentStoreId } = useCurrentStore();
  const provider = useSdrPilotSettingsProvider();
  const [settings, setSettings] = useState<ISdrPilotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeoutInput, setTimeoutInput] = useState("2");

  useEffect(() => {
    if (!currentStoreId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void provider
      .get(currentStoreId)
      .then((s) => {
        setSettings(s);
        setTimeoutInput(String(s.backstopTimeoutMinutes));
      })
      .finally(() => setLoading(false));
  }, [currentStoreId, provider]);

  const patch = async (p: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number }) => {
    if (!currentStoreId) return;
    try {
      const updated = await provider.update(currentStoreId, p);
      setSettings(updated);
      toast.success(AI_STRINGS.saved);
    } catch {
      toast.error(AI_STRINGS.saveError);
    }
  };

  if (!currentStoreId) {
    return <p className="text-sm text-muted-foreground">{AI_STRINGS.sdrPilot.noStore}</p>;
  }
  if (loading || !settings) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{AI_STRINGS.sdrPilot.hint}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{AI_STRINGS.sdrPilot.enabledLabel}</span>
          <Switch
            checked={settings.sdrEnabled}
            onCheckedChange={(v) => patch({ sdrEnabled: v })}
            aria-label={AI_STRINGS.sdrPilot.enabledLabel}
          />
        </div>

        <label className="mt-4 block text-xs text-muted-foreground">
          {AI_STRINGS.sdrPilot.timeoutLabel}
          <input
            type="number"
            min={1}
            max={60}
            value={timeoutInput}
            onChange={(e) => setTimeoutInput(e.target.value)}
            onBlur={() => {
              const parsed = Math.min(60, Math.max(1, Number(timeoutInput) || 2));
              setTimeoutInput(String(parsed));
              if (parsed !== settings.backstopTimeoutMinutes) {
                void patch({ backstopTimeoutMinutes: parsed });
              }
            }}
            className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{AI_STRINGS.sdrPilot.timeoutHint}</p>
      </div>
    </div>
  );
}
