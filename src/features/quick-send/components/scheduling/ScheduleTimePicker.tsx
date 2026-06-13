import type { ISO8601 } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatScheduleConfirm } from "../../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduleTimePickerProps {
  value: ISO8601 | null;
  onChange: (iso: ISO8601 | null) => void;
  /** Show the non-blocking 24h-window warning (Meta account, window closed). */
  showWindowWarning?: boolean;
  onUseTemplate?: () => void;
}

/** Tomorrow at HH:00. */
function tomorrowAt(hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Next Monday at 08:00. */
function nextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const delta = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Format a Date for `<input type="datetime-local">` (local, no seconds). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS = [
  { id: "tomorrow-9", icon: "mdi:weather-sunny", label: "Amanhã 09:00", get: () => tomorrowAt(9) },
  { id: "tomorrow-14", icon: "mdi:white-balance-sunny", label: "Amanhã 14:00", get: () => tomorrowAt(14) },
  { id: "monday-8", icon: "mdi:calendar-week-begin", label: "Segunda 08:00", get: nextMonday },
] as const;

export function ScheduleTimePicker({
  value,
  onChange,
  showWindowWarning = false,
  onUseTemplate,
}: IScheduleTimePickerProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const inputValue = value ? toLocalInputValue(new Date(value)) : "";
  const confirm = formatScheduleConfirm(value);

  // Which preset (if any) currently matches the selected time.
  const activePreset = PRESETS.find((p) => value && toLocalInputValue(p.get()) === inputValue)?.id;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.whenLabel}
      </p>
      <ToggleGroup
        type="single"
        value={activePreset ?? ""}
        onValueChange={(id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (preset) onChange(preset.get().toISOString());
        }}
        className="flex flex-wrap justify-start gap-2"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            className="h-auto flex-1 flex-col gap-0.5 rounded-md border border-border px-2 py-2 data-[state=on]:border-primary data-[state=on]:bg-primary/10"
          >
            <Icon icon={p.icon} size={16} className="text-muted-foreground" />
            <span className="text-xs">{p.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Input
        type="datetime-local"
        value={inputValue}
        min={toLocalInputValue(new Date())}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        aria-label={QUICK_SEND_STRINGS.schedule.custom}
        className="h-11"
      />

      {confirm && (
        <p className="flex items-center gap-1.5 text-xs text-severity-success">
          <Icon icon="mdi:check-circle-outline" size={14} />
          {confirm}
        </p>
      )}

      {showWindowWarning && (
        <div className="flex items-start gap-2 rounded-md border border-severity-warning/30 bg-severity-warning/10 p-2 text-[11.5px] text-severity-warning">
          <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{s.window24hWarn}</p>
            {onUseTemplate && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={cn("h-auto p-0 text-severity-warning underline")}
                onClick={onUseTemplate}
              >
                {s.useTemplate}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
