import { useState } from "react";
import type { ISO8601 } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { validateFuture, formatScheduleLabel } from "../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IScheduleSendMenuProps {
  onSchedule: (scheduledFor: ISO8601) => void;
  /** Disabled when there is nothing stageable to schedule. */
  disabled?: boolean;
}

/** Today at 18:00 (or tomorrow 18:00 if already past). */
function presetTodayEvening(now: Date): Date {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** Tomorrow at 09:00. */
function presetTomorrowMorning(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Next Monday at 08:00. */
function presetNextMonday(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun..6=Sat
  const delta = (8 - day) % 7 || 7; // strictly next Monday
  d.setDate(d.getDate() + delta);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Format a Date for `<input type="datetime-local">` value (local, no seconds). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Split-button menu attached to "Enviar". A SINGLE Popover (no nested overlay):
 * presets + an always-visible custom datetime field live in one panel, so
 * interacting with the date input or the confirm button never tears the panel
 * down — the previous DropdownMenu+nested-Popover combo closed the moment the
 * pointer reached the portaled popover. Every choice is re-validated by
 * `validateFuture` before bubbling `onSchedule` with an ISO8601 string (D-11).
 */
export function ScheduleSendMenu({ onSchedule, disabled = false }: IScheduleSendMenuProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState<string>(() =>
    toLocalInputValue(presetTomorrowMorning(new Date())),
  );

  const emit = (date: Date) => {
    const iso = date.toISOString();
    const check = validateFuture(iso, new Date().toISOString());
    if (!check.ok) {
      toast.error(s.pastRejected);
      return;
    }
    onSchedule(iso);
    toast.success(s.scheduledToast(formatScheduleLabel(iso)));
    setOpen(false);
  };

  const handleCustom = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (Number.isNaN(date.getTime())) {
      toast.error(s.pastRejected);
      return;
    }
    emit(date);
  };

  const presets = [
    { icon: "mdi:weather-sunset", label: s.presetTodayEvening, get: presetTodayEvening },
    { icon: "mdi:weather-sunny", label: s.presetTomorrowMorning, get: presetTomorrowMorning },
    { icon: "mdi:calendar-week-begin", label: s.presetMonday, get: presetNextMonday },
  ] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-9 w-7 shrink-0 rounded-l-none border-l border-primary-foreground/20 px-0"
          aria-label={s.scheduleSend}
          disabled={disabled}
          aria-disabled={disabled}
        >
          <Icon icon="mdi:chevron-down" size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-1 pb-1 text-xs font-semibold text-muted-foreground">{s.scheduleSend}</p>

        <div className="flex flex-col">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 justify-start gap-2 font-normal"
              onClick={() => emit(p.get(new Date()))}
            >
              <Icon icon={p.icon} size={15} className="text-muted-foreground" />
              {p.label}
            </Button>
          ))}
        </div>

        <div className="my-2 border-t border-border" />

        <label
          className="flex items-center gap-2 px-1 pb-1.5 text-xs font-medium text-foreground"
          htmlFor="schedule-custom-dt"
        >
          <Icon icon="mdi:calendar-clock" size={14} className="text-muted-foreground" />
          {s.custom}
        </label>
        <Input
          id="schedule-custom-dt"
          type="datetime-local"
          value={customValue}
          min={toLocalInputValue(new Date())}
          onChange={(e) => setCustomValue(e.target.value)}
        />
        <Button type="button" size="sm" className="mt-2 w-full" onClick={handleCustom}>
          {s.scheduleSend}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
