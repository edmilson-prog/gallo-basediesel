import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { buildKmSeries } from "../../utils/kmSeries";
import { VehicleInvite } from "../VehicleInvite";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.kmEvolution;
const INVITE_COPY = VEHICLE_STRINGS.detail.invites;

export interface IVehicleKmEvolutionCardProps {
  vehicle: IVehicle;
  now?: Date;
  /** Offered when there aren't two readings yet — a second one draws the curve. */
  onUpdateKm?: () => void;
  className?: string;
}

export function VehicleKmEvolutionCard({
  vehicle,
  now = new Date(),
  onUpdateKm,
  className,
}: IVehicleKmEvolutionCardProps) {
  const series = useMemo(() => buildKmSeries(vehicle, now), [vehicle, now]);
  const hasData = series.length >= 2;

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon icon="mdi:chart-areaspline" size={16} className="text-muted-foreground" />
          {COPY.title}
        </h2>
        {hasData && onUpdateKm ? (
          <button
            type="button"
            onClick={onUpdateKm}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:underline"
          >
            <Icon icon="mdi:counter" size={12} />
            {VEHICLE_STRINGS.detail.tech.updateKm}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{COPY.window}</span>
        )}
      </header>

      {!hasData ? (
        <VehicleInvite
          compact
          className="min-h-44"
          icon="mdi:chart-areaspline"
          title={INVITE_COPY.kmChartTitle}
          description={INVITE_COPY.kmChartDescription}
          action={
            onUpdateKm
              ? {
                  icon: "mdi:counter",
                  label: VEHICLE_STRINGS.detail.health.unknownCta,
                  onClick: onUpdateKm,
                }
              : undefined
          }
        />
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="vehicleKmArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(value: unknown) => [
                  `${(value as number).toLocaleString("pt-BR")} km`,
                  COPY.tooltip,
                ]}
              />
              <Area
                type="monotone"
                dataKey="km"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#vehicleKmArea)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
