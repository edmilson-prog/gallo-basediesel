import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IAnalyticsAnswer } from "@/shared/types/analytics-copilot";
import { findMetricById } from "../catalog/metricCatalog";
import { metricIcon } from "../catalog/metricUi";
import {
  comparisonModeLabel,
  filterEntries,
  formatPeriodLabel,
  scopeLabel,
} from "../utils/answerFormatting";
import { Sparkline } from "./Sparkline";

interface ICopilotDetailPanelProps {
  answer: IAnalyticsAnswer | null;
}

const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Pinned "fiche" of the last resolved answer (Split mode). Structured fields the
 *  inline card doesn't expand. Renders only data present in IAnalyticsAnswer (RNF-001). */
export function CopilotDetailPanel({ answer }: ICopilotDetailPanelProps) {
  if (!answer || !answer.resolved) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:chart-box-outline" size={24} />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">Sem detalhe ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Faça uma pergunta com resposta numérica para ver a ficha aqui.
        </p>
      </div>
    );
  }

  const metric = answer.query ? findMetricById(answer.query.metricId) : undefined;
  const comparison = answer.comparison;
  const direction = comparison
    ? comparison.delta > 0
      ? "up"
      : comparison.delta < 0
        ? "down"
        : "flat"
    : "flat";
  const deltaClasses =
    direction === "up"
      ? "bg-severity-success/10 text-severity-success"
      : direction === "down"
        ? "bg-severity-critical/10 text-severity-critical"
        : "bg-muted text-muted-foreground";
  const deltaIcon =
    direction === "up"
      ? "mdi:arrow-top-right"
      : direction === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const deltaPercentLabel = comparison
    ? `${comparison.deltaPercent > 0 ? "+" : ""}${formatPercent(comparison.deltaPercent)}`
    : "";
  const showSparkline = answer.visual === "sparkline" && (answer.series?.length ?? 0) >= 2;
  const metricKey = metric?.metricKey;
  const prevValue =
    comparison &&
    (metricKey && COUNT_METRIC_KEYS.has(metricKey)
      ? comparison.previousValue.toLocaleString("pt-BR")
      : formatBRL(comparison.previousValue));
  const filters = filterEntries(answer.query?.filters);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Última resposta
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon
            icon={answer.query ? metricIcon(answer.query.metricId) : "mdi:chart-line"}
            size={16}
          />
        </span>
        <span className="text-sm font-medium text-foreground">{metric?.label ?? "Métrica"}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight text-foreground">
          {answer.formattedValue ?? "—"}
        </span>
        {comparison && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              deltaClasses,
            )}
          >
            <Icon icon={deltaIcon} size={14} />
            {deltaPercentLabel}
          </span>
        )}
      </div>
      {comparison && prevValue && (
        <p className="mt-1 text-xs text-muted-foreground">vs. {prevValue} no período anterior</p>
      )}

      {showSparkline && (
        <div className="mt-4">
          <Sparkline series={answer.series!} height={48} className="h-12" />
        </div>
      )}

      <dl className="mt-4 divide-y divide-border border-t border-border">
        {answer.query?.period && (
          <Field label="Período" value={formatPeriodLabel(answer.query.period)} />
        )}
        {answer.query?.scope && <Field label="Escopo" value={scopeLabel(answer.query.scope)} />}
        {filters.map((f) => (
          <Field key={f.label} label={f.label} value={f.value} />
        ))}
        {answer.query?.comparison && (
          <Field label="Comparação" value={comparisonModeLabel(answer.query.comparison)} />
        )}
      </dl>

      {answer.citation && (
        <div className="mt-auto pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon="mdi:check-decagram-outline" size={14} className="text-primary" />
            Fonte: {answer.citation.source.label} ({answer.citation.source.prd})
          </p>
          <Link
            to={answer.citation.drillDownUrl}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver no painel {answer.citation.source.label}
            <Icon icon="mdi:arrow-right" size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
