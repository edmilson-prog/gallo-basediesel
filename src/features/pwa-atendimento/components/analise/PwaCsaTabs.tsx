import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import { CSA_STRINGS, deltaPctOf, formatDuration } from "@/features/customer-service-analytics";
import type { ICustomerServiceMetrics, ISellerServiceMetrics } from "@/shared/types";
import { PWA_CHANNEL_META } from "../ui/statusMeta";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";
import { PwaCsaKpiCard } from "./PwaCsaKpiCard";
import { PwaCsaDailyChart, PwaCsaSegmentBar, PwaCsaTrendChart } from "./PwaCsaCharts";

/** Bloco com título, usado por todas as sub-abas. */
function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded bg-card px-3.5 py-3.5 ring-1 ring-inset ring-border">
      <h2 className="text-[13px] font-extrabold text-foreground">{title}</h2>
      {help && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">{help}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ── Visão Geral ────────────────────────────────────────────────────────── */

export function PwaCsaOverview({ metrics }: { metrics: ICustomerServiceMetrics }) {
  const { totals, previous } = metrics;
  const delta = (pick: (kpis: typeof totals) => number) =>
    previous ? deltaPctOf(pick(totals), pick(previous)) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiVolume}
          value={String(totals.totalConversations)}
          deltaPct={delta((k) => k.totalConversations)}
        />
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiTma}
          value={formatDuration(totals.averageHandleTime)}
          help={CSA_STRINGS.kpiTmaHelp}
          deltaPct={delta((k) => k.averageHandleTime)}
          lowerIsBetter
        />
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiTmr}
          value={formatDuration(totals.averageResponseTime)}
          help={CSA_STRINGS.kpiTmrHelp}
          deltaPct={delta((k) => k.averageResponseTime)}
          lowerIsBetter
        />
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiResolution}
          value={formatPercent(totals.resolutionRate)}
          help={CSA_STRINGS.kpiResolutionHelp}
          deltaPct={delta((k) => k.resolutionRate)}
        />
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiConversion}
          value={formatPercent(totals.conversionRate)}
          help={CSA_STRINGS.kpiConversionHelp}
          deltaPct={delta((k) => k.conversionRate)}
        />
        <PwaCsaKpiCard
          label={CSA_STRINGS.kpiNpsPlaceholder}
          value="—"
          help={CSA_STRINGS.kpiNpsPlaceholderHelp}
          deltaPct={null}
          placeholder
        />
      </div>

      <Section title={CSA_STRINGS.chartTrendTitle} help={CSA_STRINGS.chartTrendHelp}>
        <PwaCsaTrendChart points={metrics.trendMonthly} />
      </Section>

      <Section title={CSA_STRINGS.chartVolumeTitle} help={CSA_STRINGS.chartVolumeHelp}>
        <PwaCsaDailyChart points={metrics.trendDaily} />
      </Section>
    </div>
  );
}

/* ── Por Canal ──────────────────────────────────────────────────────────── */

const CHANNEL_TONE = [
  "bg-severity-success",
  "bg-severity-info",
  "bg-primary",
  "bg-severity-warning",
  "bg-muted-foreground",
];

export function PwaCsaChannel({ metrics }: { metrics: ICustomerServiceMetrics }) {
  const rows = metrics.byChannel.filter((row) => row.totalConversations > 0);
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        {CSA_STRINGS.channelEmpty}
      </p>
    );
  }

  const labelOf = (channel: string) =>
    PWA_CHANNEL_META[channel as keyof typeof PWA_CHANNEL_META]?.label ??
    (channel === "sdr" ? "SDR" : "Outros");

  return (
    <div className="flex flex-col gap-3">
      <Section title={CSA_STRINGS.chartChannelTitle} help={CSA_STRINGS.chartChannelHelp}>
        <PwaCsaSegmentBar
          segments={rows.map((row, index) => ({
            key: row.channel,
            label: labelOf(row.channel),
            value: row.totalConversations,
            toneClass: CHANNEL_TONE[index % CHANNEL_TONE.length] ?? "bg-muted-foreground",
          }))}
        />
        <ul className="mt-3 flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.channel} className="flex items-center gap-2 text-[12.5px]">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  CHANNEL_TONE[index % CHANNEL_TONE.length],
                )}
                aria-hidden
              />
              <span className="flex-1 font-semibold text-foreground">{labelOf(row.channel)}</span>
              <span className="tabular-nums text-muted-foreground">{row.totalConversations}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* A tabela de 6 colunas do desktop não cabe em 412px — vira um cartão
          por canal, com os mesmos quatro números. */}
      {rows.map((row) => (
        <Section key={row.channel} title={labelOf(row.channel)}>
          <dl className="grid grid-cols-2 gap-y-2.5 text-[12.5px]">
            {[
              [CSA_STRINGS.kpiTma, formatDuration(row.averageHandleTime)],
              [CSA_STRINGS.kpiTmr, formatDuration(row.averageResponseTime)],
              [CSA_STRINGS.kpiResolution, formatPercent(row.resolutionRate)],
              [CSA_STRINGS.kpiConversion, formatPercent(row.conversionRate)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 font-bold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}
    </div>
  );
}

/* ── Por Vendedor ───────────────────────────────────────────────────────── */

function healthTone(score: number, average: number): string {
  if (score < average) return "text-severity-critical";
  return score >= 70 ? "text-severity-success" : "text-severity-warning";
}

export function PwaCsaSeller({
  metrics,
  onOpenSeller,
}: {
  metrics: ICustomerServiceMetrics;
  onOpenSeller: (seller: ISellerServiceMetrics) => void;
}) {
  const rows = metrics.bySeller;
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        {CSA_STRINGS.sellerEmpty}
      </p>
    );
  }

  const average = rows.reduce((sum, row) => sum + row.healthScore, 0) / rows.length;

  return (
    <div className="flex flex-col gap-3">
      <Section title={S.analise.teamAverage}>
        <p className="font-display text-[30px] font-extrabold leading-none text-foreground">
          {Math.round(average)}
          <span className="ml-1 text-[15px] font-bold text-muted-foreground">/100</span>
        </p>
      </Section>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <button
            key={row.sellerId}
            type="button"
            onClick={() => onOpenSeller(row)}
            className="flex min-h-[56px] items-center gap-3 rounded bg-card px-3.5 py-3 text-left ring-1 ring-inset ring-border active:bg-foreground/[0.04]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-extrabold text-foreground">
                {row.sellerName}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                {S.analise.conversationsOf(row.totalConversations)}
                {row.healthScore < average && (
                  <span className="ml-1.5 text-severity-critical">
                    · {CSA_STRINGS.sellerBelowAverage}
                  </span>
                )}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 font-display text-[19px] font-extrabold tabular-nums",
                healthTone(row.healthScore, average),
              )}
            >
              {Math.round(row.healthScore)}
            </span>
            <Icon icon="mdi:chevron-right" size={16} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Escalações SDR ─────────────────────────────────────────────────────── */

const REASON_LABEL: Record<string, string> = {
  customer_requested: CSA_STRINGS.reasonCustomerRequested,
  negotiation_detected: CSA_STRINGS.reasonNegotiationDetected,
  sdr_failed: CSA_STRINGS.reasonSdrFailed,
  complexity: CSA_STRINGS.reasonComplexity,
  out_of_scope: CSA_STRINGS.reasonOutOfScope,
  qualified_handoff: CSA_STRINGS.reasonQualifiedHandoff,
};

export function PwaCsaEscalations({ metrics }: { metrics: ICustomerServiceMetrics }) {
  const { escalations } = metrics;
  const reasons = Object.entries(escalations.byReason)
    .map(([key, value]) => ({ key, label: REASON_LABEL[key] ?? key, value }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-3">
      <Section title={CSA_STRINGS.escAvgTitle}>
        <p className="font-display text-[30px] font-extrabold leading-none text-foreground">
          {escalations.total}
        </p>
      </Section>

      <Section title={CSA_STRINGS.escByReasonTitle}>
        {reasons.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted-foreground">{CSA_STRINGS.escByReasonEmpty}</p>
        ) : (
          <>
            <PwaCsaSegmentBar
              segments={reasons.map((reason, index) => ({
                key: reason.key,
                label: reason.label,
                value: reason.value,
                toneClass: CHANNEL_TONE[index % CHANNEL_TONE.length] ?? "bg-muted-foreground",
              }))}
            />
            <ul className="mt-3 flex flex-col gap-1.5">
              {reasons.map((reason, index) => (
                <li key={reason.key} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      CHANNEL_TONE[index % CHANNEL_TONE.length],
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {reason.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPercent(reason.value / escalations.total)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {escalations.bySeller.length > 0 && (
        <Section title={CSA_STRINGS.escTopSellersTitle}>
          <ul className="flex flex-col gap-2">
            {escalations.bySeller.map((seller) => (
              <li key={seller.sellerId} className="flex items-center gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {seller.sellerName}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {S.analise.escalationsOf(seller.total)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
