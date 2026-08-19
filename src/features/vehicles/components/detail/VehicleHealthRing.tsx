import { cn } from "@/lib/utils";
import type { IVehicleHealth } from "../../utils/vehicleHealth";
import { HEALTH_STATUS_META } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.health;

const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;

export interface IVehicleHealthRingProps {
  health: IVehicleHealth;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * The health gauge. With no score the arc is not drawn at all and the track
 * goes dashed — an empty ring reads as "not measured", where a full green one
 * would read as "measured and perfect".
 */
export function VehicleHealthRing({ health, size = 128, className }: IVehicleHealthRingProps) {
  const meta = HEALTH_STATUS_META[health.status];
  const score = health.score;
  const isUnknown = score === null;
  const offset = score === null ? CIRC : CIRC * (1 - score / 100);

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? COPY.ariaLabelUnknown : COPY.ariaLabel(score, meta.label)}
    >
      <svg viewBox="0 0 80 80" className="-rotate-90" style={{ width: size, height: size }}>
        <circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="7"
          strokeDasharray={isUnknown ? "2 5" : undefined}
        />
        {!isUnknown && (
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            className={meta.text}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className={cn(
            "font-bold tabular-nums",
            isUnknown ? "text-muted-foreground" : "text-foreground",
          )}
          style={{ fontSize: Math.round(size * 0.24) }}
        >
          {score === null ? "—" : score}
        </span>
        <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
      </div>
    </div>
  );
}
