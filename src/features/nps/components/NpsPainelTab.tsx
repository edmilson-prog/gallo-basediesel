import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import type { INpsBreakdown } from "@/shared/types";
import { computeNps, npsBandLabel, type INpsBandThresholds } from "../engine";
import type { INpsMetricsResult } from "../hooks/useNpsMetrics";
import { S } from "../i18n/pt-BR";
import { NpsAvatar, NpsCard, NpsChip } from "./NpsKit";
import { initialsOf, type INpsTone } from "./npsTones";
import {
  CATEGORY,
  NpsBreakdownRow,
  NpsReasons,
  NpsRuler,
  NpsStack,
  NpsTrendChart,
} from "./NpsPanelParts";

/**
 * "Painel" — the kit's `NpsPanelA` (direction A · Denso, `nps-panel.jsx`).
 *
 * Everything on the first screen: score, cuts and reasons in a compact grid.
 * The kit also draws a direction B (editorial, one reading per block); A is the
 * one built, because this screen is opened daily by someone checking a number,
 * not read once like a report.
 *
 * The answers table and the detractor list that used to sit at the bottom moved
 * out to their own tabs, which is where the kit puts them.
 */

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "muted",
  valueClass = "text-card-foreground",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: string;
  tone?: INpsTone;
  valueClass?: string;
}) {
  const iconClass =
    tone === "success"
      ? "text-severity-success"
      : tone === "critical"
        ? "text-severity-critical"
        : "text-muted-foreground/70";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon icon={icon} size={14} className={iconClass} />
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className={`font-display text-[34px] font-bold leading-[0.9] ${valueClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Per-attendant table — the kit's `NpsAgentTable`, with avatar and first response. */
function SellerTable({
  rows,
  minResponses,
  target,
  bands,
}: {
  rows: INpsBreakdown[];
  minResponses: number;
  target: number;
  bands: INpsBandThresholds;
}) {
  const scored = useMemo(
    () =>
      rows
        .map((row) => {
          const responses = [
            ...Array<{ score: number }>(row.promoters).fill({ score: 10 }),
            ...Array<{ score: number }>(row.passives).fill({ score: 8 }),
            ...Array<{ score: number }>(row.detractors).fill({ score: 3 }),
          ];
          const total = responses.length;
          const result = computeNps(responses, { minResponses, sent: total });
          return { ...row, score: result.score, total };
        })
        .sort((a, b) => (b.score ?? -101) - (a.score ?? -101)),
    [rows, minResponses],
  );

  if (scored.length === 0) {
    return <p className="text-sm text-muted-foreground">{S.bySellerEmpty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div className="grid grid-cols-[1fr_52px_60px_66px] gap-2.5 border-b border-border pb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span>{S.colSeller}</span>
          <span className="text-right">NPS</span>
          <span className="text-right">{S.colResponses}</span>
          <span className="text-right">Detrat.</span>
        </div>
        {scored.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[1fr_52px_60px_66px] items-center gap-2.5 border-b border-border py-2.5 last:border-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <NpsAvatar initials={initialsOf(row.label)} size={26} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-card-foreground">
                  {row.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {row.score === null ? S.collectingShort : npsBandLabel(row.score, bands)}
                </span>
              </span>
            </span>
            <span
              className={`text-right font-display text-lg font-bold ${
                row.score === null
                  ? "text-muted-foreground"
                  : row.score >= target
                    ? "text-severity-success"
                    : row.score >= 40
                      ? "text-primary"
                      : "text-severity-critical"
              }`}
            >
              {row.score ?? "–"}
            </span>
            <span className="text-right text-[13px] text-muted-foreground">{row.total}</span>
            <span
              className={`text-right text-[13px] font-bold ${
                row.detractors > 3 ? "text-severity-critical" : "text-muted-foreground"
              }`}
            >
              {row.detractors}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NpsPainelTab({
  metrics,
  windowLabel,
  target,
  bands,
  onGoRecoveries,
  openRecoveries,
}: {
  metrics: INpsMetricsResult | undefined;
  windowLabel: string;
  target: number;
  bands: INpsBandThresholds;
  onGoRecoveries: () => void;
  openRecoveries: number | null;
}) {
  const collecting = metrics?.state === "collecting";
  const score = metrics?.score ?? null;
  const minResponses = metrics?.minResponses ?? 5;

  const storeScore = (item: INpsBreakdown) => {
    const responses = [
      ...Array<{ score: number }>(item.promoters).fill({ score: 10 }),
      ...Array<{ score: number }>(item.passives).fill({ score: 8 }),
      ...Array<{ score: number }>(item.detractors).fill({ score: 3 }),
    ];
    return computeNps(responses, { minResponses, sent: responses.length }).score;
  };

  // The kit's "+27 pts em 12 meses". Only shown when both ends of the trend
  // carry a real score; a chip computed against a null month would invent a
  // swing that never happened.
  const monthly = metrics?.monthly ?? [];
  const firstScored = monthly.find((point) => point.score !== null);
  const lastScored = [...monthly].reverse().find((point) => point.score !== null);
  const yearSwing =
    firstScored?.score != null && lastScored?.score != null && firstScored !== lastScored
      ? lastScored.score - firstScored.score
      : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-primary/60 bg-card px-4 py-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <Icon icon="lucide:gauge" size={14} className="text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-primary">
              {S.kpiScore} · {windowLabel}
            </span>
          </div>
          {collecting || score === null ? (
            <>
              <div className="font-display text-2xl font-bold leading-tight text-muted-foreground">
                {S.collecting(metrics?.n ?? 0, minResponses)}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{S.collectingHelp}</div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-[44px] font-extrabold leading-[0.85] text-foreground">
                  {score}
                </span>
                <span className="font-display text-[12.5px] font-bold uppercase italic text-primary">
                  {npsBandLabel(score, bands)}
                </span>
              </div>
              {metrics?.delta !== null && metrics?.delta !== undefined ? (
                <div
                  className={`mt-2 text-xs ${metrics.delta >= 0 ? "text-severity-success" : "text-severity-critical"}`}
                >
                  {metrics.delta >= 0 ? "+" : ""}
                  {metrics.delta} pts {S.kpiDelta}
                </div>
              ) : null}
            </>
          )}
        </div>

        <Kpi
          icon="lucide:message-square-quote"
          label={S.kpiResponses}
          value={metrics?.n ?? 0}
          sub={S.responseRateSub(
            Math.round((metrics?.responseRate ?? 0) * 100),
            metrics?.sent ?? 0,
          )}
        />
        <Kpi
          icon="lucide:thumbs-up"
          tone="success"
          label={S.kpiPromoters}
          value={`${metrics && metrics.n > 0 ? Math.round((metrics.promoters / metrics.n) * 100) : 0}%`}
          sub={S.promotersSub(metrics?.promoters ?? 0)}
          valueClass="text-severity-success"
        />
        <button type="button" onClick={onGoRecoveries} className="text-left">
          <Kpi
            icon="lucide:triangle-alert"
            tone="critical"
            label={S.kpiDetractors}
            value={`${metrics && metrics.n > 0 ? Math.round((metrics.detractors / metrics.n) * 100) : 0}%`}
            sub={
              openRecoveries === null
                ? S.detractorsSub(metrics?.detractors ?? 0)
                : `${openRecoveries} sem tratativa concluída`
            }
            valueClass="text-severity-critical"
          />
        </button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.45fr]">
        <NpsCard title={S.distributionTitle} icon="lucide:chart-pie">
          <NpsStack
            promoters={metrics?.promoters ?? 0}
            passives={metrics?.passives ?? 0}
            detractors={metrics?.detractors ?? 0}
            height={12}
            labels
          />
          <div className="mt-4">
            <NpsRuler score={score ?? 0} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {(["promoter", "passive", "detractor"] as const).map((key) => {
              const meta = CATEGORY[key];
              const value =
                key === "promoter"
                  ? (metrics?.promoters ?? 0)
                  : key === "passive"
                    ? (metrics?.passives ?? 0)
                    : (metrics?.detractors ?? 0);
              return (
                <div key={key} className="rounded-lg bg-muted/40 px-2.5 py-2.5">
                  <div
                    className={`font-display text-[10.5px] font-bold uppercase italic ${meta.toneClass}`}
                  >
                    {meta.short} · {meta.range}
                  </div>
                  <div className="mt-1 font-display text-[22px] font-bold text-card-foreground">
                    {value}
                  </div>
                </div>
              );
            })}
          </div>
        </NpsCard>

        <NpsCard
          title={S.trendTitle}
          icon="lucide:chart-no-axes-combined"
          sub={S.trendSub}
          right={
            yearSwing !== null ? (
              <NpsChip
                size="sm"
                tone={yearSwing >= 0 ? "success" : "critical"}
                icon={yearSwing >= 0 ? "lucide:arrow-up" : "lucide:arrow-down"}
              >
                {yearSwing >= 0 ? "+" : ""}
                {yearSwing} pts em 12 meses
              </NpsChip>
            ) : undefined
          }
        >
          <NpsTrendChart points={monthly} target={target} />
        </NpsCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <NpsCard title={S.byStoreTitle} icon="lucide:map-pin">
          {(metrics?.byStore ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{S.empty}</p>
          ) : (
            (metrics?.byStore ?? []).map((item) => (
              <NpsBreakdownRow
                key={item.key}
                item={item}
                score={storeScore(item)}
                target={target}
                bands={bands}
              />
            ))
          )}
        </NpsCard>

        <NpsCard
          title={S.bySellerTitle}
          icon="lucide:users"
          right={
            <Link
              to="/app/gestao/ranking"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Ranking
            </Link>
          }
        >
          <SellerTable
            rows={metrics?.bySeller ?? []}
            minResponses={minResponses}
            target={target}
            bands={bands}
          />
        </NpsCard>
      </section>

      <NpsCard title={S.reasonsTitle} icon="lucide:tags" sub={S.reasonsSub}>
        <NpsReasons up={metrics?.reasons.promoter ?? []} down={metrics?.reasons.detractor ?? []} />
      </NpsCard>
    </div>
  );
}
