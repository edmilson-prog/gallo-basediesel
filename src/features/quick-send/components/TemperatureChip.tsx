import { useEffect, useRef, useState } from "react";
import type { LeadTemperature } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { TEMPERATURE_META } from "@/features/leads/utils/leadDisplay";

export interface ITemperatureChipProps {
  temperature: LeadTemperature;
  /** When true, plays a single attention pulse (escalation just happened). */
  pulse?: boolean;
}

/** True when the user asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Temperature chip for the ConversationHeader (D-9). Cross-fades on change and
 * plays ONE pulse when the temperature escalates, unless reduced-motion is on.
 */
export function TemperatureChip({ temperature, pulse = false }: ITemperatureChipProps) {
  const meta = TEMPERATURE_META[temperature];
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef<LeadTemperature>(temperature);

  // Trigger a single pulse when temperature changes upward (or when `pulse` set).
  useEffect(() => {
    const changed = prevRef.current !== temperature;
    prevRef.current = temperature;
    if ((changed || pulse) && !prefersReducedMotion()) {
      setPulsing(true);
      const t = window.setTimeout(() => setPulsing(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [temperature, pulse]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-500",
        meta.tone,
        pulsing && "animate-pulse",
      )}
      title={meta.label}
    >
      <Icon icon={meta.icon} size={12} aria-hidden />
      <span>{meta.label}</span>
    </span>
  );
}
