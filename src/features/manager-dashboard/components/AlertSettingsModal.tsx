import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { IManagerDashboardSettings } from "@/shared/types";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

export interface IAlertSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: IManagerDashboardSettings;
  onSave: (next: IManagerDashboardSettings) => Promise<void>;
  saving: boolean;
}

const POLLING_OPTIONS = [15, 30, 60, 300] as const;

const HOURS_MIN = 1;
const HOURS_MAX = 24;
const OVERLOAD_MIN = 5;
const OVERLOAD_MAX = 50;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function AlertSettingsModal({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: IAlertSettingsModalProps) {
  const [draft, setDraft] = useState<IManagerDashboardSettings>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const handleSave = async () => {
    try {
      await onSave({
        ...draft,
        conversationWaitingHoursThreshold: clamp(
          draft.conversationWaitingHoursThreshold,
          HOURS_MIN,
          HOURS_MAX,
        ),
        sellerOverloadThreshold: clamp(draft.sellerOverloadThreshold, OVERLOAD_MIN, OVERLOAD_MAX),
      });
      toast.success(MANAGER_DASHBOARD_STRINGS.settingsSaved);
      onOpenChange(false);
    } catch {
      toast.error(MANAGER_DASHBOARD_STRINGS.settingsSaveError);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{MANAGER_DASHBOARD_STRINGS.settingsTitle}</DialogTitle>
          <DialogDescription>{MANAGER_DASHBOARD_STRINGS.settingsDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="conv-hours" className="text-sm">
                {MANAGER_DASHBOARD_STRINGS.settingsConvHoursLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="conv-hours"
                  type="number"
                  min={HOURS_MIN}
                  max={HOURS_MAX}
                  value={draft.conversationWaitingHoursThreshold}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      conversationWaitingHoursThreshold: clamp(
                        Number(e.target.value),
                        HOURS_MIN,
                        HOURS_MAX,
                      ),
                    }))
                  }
                  className="h-8 w-16 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  {MANAGER_DASHBOARD_STRINGS.settingsConvHoursUnit}
                </span>
              </div>
            </div>
            <Slider
              min={HOURS_MIN}
              max={HOURS_MAX}
              step={1}
              value={[draft.conversationWaitingHoursThreshold]}
              onValueChange={([v]) =>
                setDraft((d) => ({ ...d, conversationWaitingHoursThreshold: v }))
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {MANAGER_DASHBOARD_STRINGS.settingsEnableLabel}
              </span>
              <Switch
                checked={draft.alertConversaSemRespostaEnabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, alertConversaSemRespostaEnabled: v }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="overload-threshold" className="text-sm">
                {MANAGER_DASHBOARD_STRINGS.settingsOverloadLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="overload-threshold"
                  type="number"
                  min={OVERLOAD_MIN}
                  max={OVERLOAD_MAX}
                  value={draft.sellerOverloadThreshold}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      sellerOverloadThreshold: clamp(
                        Number(e.target.value),
                        OVERLOAD_MIN,
                        OVERLOAD_MAX,
                      ),
                    }))
                  }
                  className="h-8 w-16 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  {MANAGER_DASHBOARD_STRINGS.settingsOverloadUnit}
                </span>
              </div>
            </div>
            <Slider
              min={OVERLOAD_MIN}
              max={OVERLOAD_MAX}
              step={1}
              value={[draft.sellerOverloadThreshold]}
              onValueChange={([v]) => setDraft((d) => ({ ...d, sellerOverloadThreshold: v }))}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {MANAGER_DASHBOARD_STRINGS.settingsEnableLabel}
              </span>
              <Switch
                checked={draft.alertVendedorSobrecarregadoEnabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, alertVendedorSobrecarregadoEnabled: v }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex flex-col">
              <span className="text-sm text-foreground">
                {MANAGER_DASHBOARD_STRINGS.alertClienteADormente("Cliente", 30).split(":")[0]}
              </span>
              <span className="text-xs text-muted-foreground">
                {MANAGER_DASHBOARD_STRINGS.settingsEnableLabel}
              </span>
            </div>
            <Switch
              checked={draft.alertClienteADormenteEnabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, alertClienteADormenteEnabled: v }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="polling-frequency" className="text-sm">
              {MANAGER_DASHBOARD_STRINGS.settingsPollingLabel}
            </Label>
            <Select
              value={String(draft.alertPollingSeconds)}
              onValueChange={(v) => setDraft((d) => ({ ...d, alertPollingSeconds: Number(v) }))}
            >
              <SelectTrigger id="polling-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLLING_OPTIONS.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {MANAGER_DASHBOARD_STRINGS.settingsPollingOption(seconds)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {MANAGER_DASHBOARD_STRINGS.settingsCancel}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {MANAGER_DASHBOARD_STRINGS.settingsSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
