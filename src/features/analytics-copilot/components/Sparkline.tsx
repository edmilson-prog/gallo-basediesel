// src/features/analytics-copilot/components/Sparkline.tsx
import { cn } from "@/lib/utils";

/** Build an SVG path for a sparkline. Returns null when there's nothing to draw. */
export function buildSparklinePath(series: number[], width: number, height: number): string | null {
  if (!series || series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // avoid divide-by-zero on flat series
  const stepX = width / (series.length - 1);
  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}

interface ISparklineProps {
  series: number[];
  className?: string;
  width?: number;
  height?: number;
  /** Accessible label; when omitted the svg is aria-hidden (value already read elsewhere). */
  ariaLabel?: string;
}

/** Minimal, honest sparkline — no axes, no tooltip. Renders nothing for <2 points. */
export function Sparkline({
  series,
  className,
  width = 160,
  height = 36,
  ariaLabel,
}: ISparklineProps) {
  const d = buildSparklinePath(series, width, height);
  if (!d) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full text-primary", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill="currentColor" opacity={0.1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
