import { useState } from "react";
import type { ISO8601 } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { validateFuture } from "../engine/scheduledSend";
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
  const delta = ((8 - day) % 7) || 7; // strictly next Monday
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
 * Split-button menu attached to "Enviar". Presets + custom datetime; every
 * choice is re-validated by `validateFuture` before bubbling `onSchedule`
 * with an ISO8601 string (D-11). Past datetimes are rejected with a toast.
 */
export function ScheduleSendMenu({ onSchedule, disabled = false }: IScheduleSendMenuProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const [customOpen, setCustomOpen] = useState(false);
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
    toast.success(s.scheduledToast);
  };

  const handleCustom = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (Number.isNaN(date.getTime())) {
      toast.error(s.pastRejected);
      return;
    }
    emit(date);
    setCustomOpen(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-9 w-7 shrink-0 rounded-l-none border-l border-primary-foreground/20 px-0"
          aria-label={s.scheduleSend}
          disabled={disabled}
        >
          <Icon icon="mdi:chevron-down" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{s.scheduleSend}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => emit(presetTodayEvening(new Date()))}>
          <Icon icon="mdi:weather-sunset" size={14} className="mr-2" />
          {s.presetTodayEvening}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => emit(presetTomorrowMorning(new Date()))}>
          <Icon icon="mdi:weather-sunny" size={14} className="mr-2" />
          {s.presetTomorrowMorning}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => emit(presetNextMonday(new Date()))}>
          <Icon icon="mdi:calendar-week-begin" size={14} className="mr-2" />
          {s.presetMonday}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCustomOpen(true);
              }}
            >
              <Icon icon="mdi:calendar-clock" size={14} className="mr-2" />
              {s.custom}
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="schedule-custom-dt">
              {s.custom}
            </label>
            <Input
              id="schedule-custom-dt"
              type="datetime-local"
              value={customValue}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <Button type="button" size="sm" className="w-full" onClick={handleCustom}>
              {s.scheduleSend}
            </Button>
          </PopoverContent>
        </Popover>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
