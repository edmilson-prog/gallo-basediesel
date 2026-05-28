import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { useSalesEvolution } from "../../hooks/useSalesEvolution";
import type { IDailyEvolutionPoint, IEvolutionKpis } from "../../utils/evolution";

export interface ISalesEvolutionChartProps {
  scope: { storeId?: ID; sellerId?: ID };
  canDrillDown: boolean;
}

type SeriesKey = "vendas" | "objetivo" | "previsao" | "mesPassado" | "anoPassado";

const SERIES_META: Record<SeriesKey, { label: string; color: string; dashed: boolean }> = {
  vendas: { label: S.evolutionSeriesVendas, color: "#ef4444", dashed: false },
  objetivo: { label: S.evolutionSeriesObjetivo, color: "#7c3aed", dashed: false },
  previsao: { label: S.evolutionSeriesPrevisao, color: "#f59e0b", dashed: true },
  mesPassado: { label: S.evolutionSeriesMesPassado, color: "#94a3b8", dashed: true },
  anoPassado: { label: S.evolutionSeriesAnoPassado, color: "#94a3b8", dashed: true },
};

const SELLER_COLORS = ["#ef4444", "#7c3aed", "#0ea5e9", "#f59e0b", "#16a34a", "#db2777", "#94a3b8"];

// A chart data point extended with per-seller cumulative revenue values.
// Keys for sellers are the seller's name (arbitrary string), typed via index signature.
type ChartPoint = IDailyEvolutionPoint & Record<string, number | null | string | boolean>;

export function SalesEvolutionChart({ scope, canDrillDown }: ISalesEvolutionChartProps) {
  const { isLoading, hasGoal, referenceDate, points, sellerSeries, kpis } = useSalesEvolution({ scope });
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    vendas: true,
    objetivo: true,
    previsao: true,
    mesPassado: false,
    anoPassado: false,
  });
  const [bySeller, setBySeller] = useState(false);

  const today = referenceDate.getDate();
  const daysInMonth = points.length;
  const empty = !isLoading && points.every((p) => (p.vendas ?? 0) === 0 && p.mesPassado === 0);

  const toggle = (k: SeriesKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  // Merge seller data into each point so Recharts can use plain string dataKeys.
  const sellerMergedPoints = useMemo<ChartPoint[]>(() => {
    if (!bySeller || sellerSeries.length === 0) return points as ChartPoint[];
    return points.map((pt, idx) => {
      const extra: Record<string, number | null> = {};
      for (const s of sellerSeries) {
        extra[s.sellerName] = s.data[idx] ?? null;
      }
      return { ...pt, ...extra } as ChartPoint;
    });
  }, [bySeller, points, sellerSeries]);

  return (
    <Card className="flex w-full flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:chart-areaspline-variant" size={20} className="text-muted-foreground" />
            {S.evolutionTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            {bySeller ? S.evolutionSubtitleSeller : S.evolutionSubtitle}
          </p>
        </div>
        {canDrillDown && (
          <Button
            variant={bySeller ? "default" : "outline"}
            size="sm"
            onClick={() => setBySeller((v) => !v)}
            className="gap-2"
          >
            <Icon icon="mdi:account-group-outline" size={16} />
            {bySeller ? S.evolutionDrillDownBack : S.evolutionDrillDown}
          </Button>
        )}
      </header>

      {!bySeller && <EvolutionKpis kpis={kpis} hasGoal={hasGoal} isLoading={isLoading} />}

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sellerMergedPoints} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="evolutionVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="day"
                type="number"
                domain={[1, daysInMonth]}
                ticks={points.map((p) => p.day)}
                interval={0}
                tickLine={false}
                stroke="var(--border)"
                height={36}
                tick={(props: IDayTickProps) => <DayTick {...props} points={points} />}
              />
              <YAxis
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={64}
              />
              <Tooltip content={<EvolutionTooltip bySeller={bySeller} />} />

              {points.filter((p) => p.isWeekend).map((p) => (
                <ReferenceArea
                  key={`we-${p.day}`}
                  x1={p.day - 0.5}
                  x2={p.day + 0.5}
                  fill="var(--muted)"
                  fillOpacity={0.35}
                />
              ))}
              <ReferenceLine
                x={today}
                stroke="var(--muted-foreground)"
                strokeWidth={1.4}
                label={{ value: S.evolutionToday, position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
              />

              {/* Series are rendered as DIRECT children of ComposedChart — Recharts
                  does not recurse into React Fragments to discover data series. */}
              {!bySeller && visible.anoPassado && (
                <Line type="monotone" dataKey="anoPassado" stroke={SERIES_META.anoPassado.color} strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />
              )}
              {!bySeller && visible.mesPassado && (
                <Line type="monotone" dataKey="mesPassado" stroke={SERIES_META.mesPassado.color} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
              )}
              {!bySeller && visible.objetivo && (
                <Line type="linear" dataKey="objetivo" stroke={SERIES_META.objetivo.color} strokeWidth={2.5} dot={false} connectNulls />
              )}
              {!bySeller && visible.previsao && (
                <Line type="monotone" dataKey="previsao" stroke={SERIES_META.previsao.color} strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
              )}
              {!bySeller && visible.vendas && (
                <Area type="monotone" dataKey="vendas" stroke={SERIES_META.vendas.color} strokeWidth={3} fill="url(#evolutionVendas)" dot={{ r: 3, fill: SERIES_META.vendas.color }} activeDot={{ r: 5 }} />
              )}
              {bySeller && visible.objetivo && (
                <Line type="linear" dataKey="objetivo" stroke={SERIES_META.objetivo.color} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              )}
              {bySeller &&
                sellerSeries.map((s, i) => (
                  <Line
                    key={s.sellerId}
                    type="monotone"
                    dataKey={s.sellerName}
                    name={s.sellerName}
                    stroke={SELLER_COLORS[i % SELLER_COLORS.length] ?? SELLER_COLORS[0]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!bySeller && (
        <div className="flex flex-wrap justify-center gap-2">
          {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                visible[k] ? "border-border bg-background" : "border-border bg-background opacity-40",
              )}
            >
              <span
                className="inline-block h-0 w-4 rounded"
                style={{ borderTopWidth: 3, borderTopStyle: SERIES_META[k].dashed ? "dashed" : "solid", borderTopColor: SERIES_META[k].color }}
              />
              {SERIES_META[k].label}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── DayTick ───────────────────────────────────────────────────────────────────

interface IDayTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  points?: { day: number; weekdayLabel: string; isWeekend: boolean }[];
}

function DayTick({ x = 0, y = 0, payload, points = [] }: IDayTickProps) {
  const p = points.find((pt) => pt.day === payload?.value);
  if (!p) return null;
  const muted = p.isWeekend;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} fontWeight={600} fill={muted ? "var(--muted-foreground)" : "var(--foreground)"} opacity={muted ? 0.55 : 1}>
        {p.day}
      </text>
      <text x={0} y={0} dy={26} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" opacity={muted ? 0.5 : 0.85}>
        {p.weekdayLabel}
      </text>
    </g>
  );
}

// ── EvolutionTooltip ──────────────────────────────────────────────────────────

interface ITooltipEntry {
  dataKey?: string | number;
  value?: number | null;
  color?: string;
  name?: string;
  payload?: ChartPoint;
}

interface IEvolutionTooltipProps {
  active?: boolean;
  payload?: ITooltipEntry[];
  label?: number;
  bySeller: boolean;
}

function EvolutionTooltip({ active, payload, label, bySeller }: IEvolutionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{`Dia ${label}`}</p>
      {payload.map((entry) => {
        if (entry.value == null) return null;
        const key = String(entry.dataKey);
        const meta = bySeller ? undefined : SERIES_META[key as SeriesKey];
        const lbl = meta ? meta.label : (entry.name ?? key);
        const color = meta ? meta.color : entry.color;
        return (
          <p key={key} style={{ color }}>
            {lbl}: <b>{formatBRL(entry.value)}</b>
          </p>
        );
      })}
      {point?.vendasDia != null && (
        <p className="mt-1 border-t border-border pt-1 text-muted-foreground">
          {S.evolutionTooltipSoldToday}:{" "}
          <b className="text-foreground">{formatBRL(point.vendasDia)}</b>
        </p>
      )}
    </div>
  );
}

// ── EvolutionKpis ─────────────────────────────────────────────────────────────

interface IEvolutionKpisProps {
  kpis: IEvolutionKpis;
  hasGoal: boolean;
  isLoading: boolean;
}

function EvolutionKpis({ kpis, hasGoal, isLoading }: IEvolutionKpisProps) {
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  const pctTarget = hasGoal && kpis.target > 0 ? (kpis.projection / kpis.target) * 100 : null;
  const pctRealized = hasGoal && kpis.target > 0 ? (kpis.realized / kpis.target) * 100 : null;
  const below = kpis.gap > 0;
  const fmtPct = (n: number) =>
    `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return (
    <div className="flex flex-wrap gap-2">
      <KpiCell
        label={S.evolutionKpiRealized}
        value={formatBRL(kpis.realized)}
        sub={hasGoal ? `${formatBRL(kpis.expectedToday)} ${S.evolutionKpiExpectedToday}` : undefined}
      />
      <KpiCell
        label={S.evolutionKpiTarget}
        value={hasGoal ? formatBRL(kpis.target) : S.evolutionNoGoal}
        sub={pctRealized != null ? `${fmtPct(pctRealized)} ${S.evolutionKpiRealizedPct}` : undefined}
      />
      <KpiCell
        label={S.evolutionKpiProjection}
        value={formatBRL(kpis.projection)}
        sub={pctTarget != null ? `${fmtPct(pctTarget)} ${S.evolutionKpiOfTarget}` : undefined}
        subClass={pctTarget != null && pctTarget >= 100 ? "text-primary" : "text-destructive"}
      />
      {hasGoal && (
        <KpiCell
          label={S.evolutionKpiGap}
          value={formatBRL(Math.abs(kpis.gap))}
          valueClass={below ? "text-destructive" : "text-primary"}
          sub={below ? S.evolutionKpiBelow : S.evolutionKpiAbove}
        />
      )}
      {hasGoal && (
        <KpiCell
          label={S.evolutionKpiRequired}
          value={
            kpis.gapToTarget <= 0
              ? S.evolutionKpiTargetReached
              : formatBRL(kpis.requiredPerBusinessDay)
          }
          unit={kpis.gapToTarget > 0 ? S.evolutionKpiPerBusinessDay : undefined}
          sub={
            kpis.gapToTarget > 0
              ? `${S.evolutionKpiEquivalent} ${formatBRL(kpis.gapToTarget)}`
              : undefined
          }
        />
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  unit,
  sub,
  valueClass,
  subClass,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold text-foreground", valueClass)}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className={cn("mt-0.5 text-[11px] text-muted-foreground", subClass)}>{sub}</p>}
    </div>
  );
}
