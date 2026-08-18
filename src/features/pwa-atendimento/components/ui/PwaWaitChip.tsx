import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatWaitTime, waitSeverity } from "@/features/conversations/engine/waitTime";

const TONE_CLASS = {
  neutral: "text-muted-foreground",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
} as const;

/** Wait-time counter with the shared traffic light: amber at 10 min, red at 30. */
export function PwaWaitChip({ ms }: { ms: number }) {
  const severity = waitSeverity(ms);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-[11.5px] font-bold tabular-nums",
        severity !== "neutral" && "bg-foreground/[0.05] px-1.5 py-0.5",
        TONE_CLASS[severity],
      )}
    >
      <Icon icon="mdi:clock-outline" size={12} />
      {formatWaitTime(ms)}
    </span>
  );
}
