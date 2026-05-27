import { cn } from "@/lib/utils";
import type { ProfitabilityHealth } from "../engine";

const CLASSES: Record<ProfitabilityHealth, string> = {
  good: "bg-success/15 text-success border-success/30",
  neutral: "bg-warning/10 text-warning border-warning/30",
  warning: "bg-destructive/10 text-destructive border-destructive/30",
  critical: "bg-destructive/15 text-destructive border-destructive/40",
};

const LABEL: Record<ProfitabilityHealth, string> = {
  good: "Boa",
  neutral: "Atenção",
  warning: "Baixa",
  critical: "Crítica",
};

export interface IHealthBadgeProps {
  health: ProfitabilityHealth;
  /** When true, the badge renders just the dot (compact mode for dense tables). */
  compact?: boolean;
  className?: string;
}

export function HealthBadge({ health, compact, className }: IHealthBadgeProps) {
  if (compact) {
    const dotClass =
      health === "good" ? "bg-success" : health === "neutral" ? "bg-warning" : "bg-destructive";
    return (
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", dotClass, className)}
        aria-label={LABEL[health]}
        title={LABEL[health]}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        CLASSES[health],
        className,
      )}
    >
      {LABEL[health]}
    </span>
  );
}
