import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/** Semantic tone of a chip — maps the design kit's CAT palette to severity tokens. */
export type PartChipTone = "neutral" | "info" | "success" | "warning" | "critical";

export type PartChipVariant = "soft" | "ghost" | "solid";

/**
 * Chip primitive from the catalog design kit (`CatChip`): uppercase, tracked,
 * bold, square-ish corners — deliberately not a pill.
 */
export interface IPartChipProps {
  children: React.ReactNode;
  tone?: PartChipTone;
  variant?: PartChipVariant;
  /** Iconify name rendered before the label. */
  icon?: string;
  size?: "sm" | "md";
  /** Native tooltip — for chips whose label is a shorthand. */
  title?: string;
  className?: string;
}

const SOFT: Record<PartChipTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-severity-info/15 text-severity-info ring-severity-info/40",
  success: "bg-severity-success/15 text-severity-success ring-severity-success/40",
  warning: "bg-severity-warning/15 text-severity-warning ring-severity-warning/40",
  critical: "bg-severity-critical/15 text-severity-critical ring-severity-critical/40",
};

const SOLID: Record<PartChipTone, string> = {
  neutral: "bg-muted text-foreground ring-transparent",
  info: "bg-severity-info text-white ring-transparent",
  success: "bg-severity-success text-white ring-transparent",
  warning: "bg-severity-warning text-white ring-transparent",
  critical: "bg-severity-critical text-white ring-transparent",
};

export function PartChip({
  children,
  tone = "neutral",
  variant = "soft",
  icon,
  size = "md",
  title,
  className,
}: IPartChipProps) {
  const toneClass =
    variant === "solid"
      ? SOLID[tone]
      : variant === "ghost"
        ? "bg-transparent text-muted-foreground ring-border"
        : SOFT[tone];

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-bold uppercase tracking-[0.05em] ring-1 ring-inset",
        size === "sm" ? "px-[9px] py-[3px] text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
        toneClass,
        className,
      )}
    >
      {icon && <Icon icon={icon} size={size === "sm" ? 11 : 12} />}
      {children}
    </span>
  );
}
