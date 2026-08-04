import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export type ProfileRowTone = "accent" | "success" | "critical" | "info" | "muted";

const TONE_CLASS: Record<ProfileRowTone, string> = {
  accent: "bg-primary/15 text-primary ring-primary/30",
  success: "bg-severity-success/15 text-severity-success ring-severity-success/30",
  critical: "bg-severity-critical/15 text-severity-critical ring-severity-critical/30",
  info: "bg-severity-info/15 text-severity-info ring-severity-info/30",
  muted: "bg-muted text-muted-foreground ring-border",
};

interface IProfileSettingRowProps {
  icon: string;
  tone?: ProfileRowTone;
  title: string;
  description: React.ReactNode;
  /** Controls/labels pinned to the right of the row. */
  right?: React.ReactNode;
  /** Drops the bottom divider (last row of a card). */
  last?: boolean;
}

/**
 * One control line inside a profile card: tinted icon tile, title, supporting
 * copy, and the action(s) on the right.
 */
export function ProfileSettingRow({
  icon,
  tone = "muted",
  title,
  description,
  right,
  last = false,
}: IProfileSettingRowProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 py-3.5", !last && "border-b border-border")}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
          TONE_CLASS[tone],
        )}
      >
        <Icon icon={icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</div>
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
