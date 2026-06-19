import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IAnalyticsAnswer } from "@/shared/types/analytics-copilot";
import { findMetricById } from "../catalog/metricCatalog";
import { formatPeriodLabel, scopeLabel } from "../utils/answerFormatting";
import { Sparkline } from "./Sparkline";

interface IAnalyticsAnswerCardProps {
  answer: IAnalyticsAnswer;
  onSuggestion?: (question: string) => void;
  /** Re-run the same question (e.g. after switching store/period). */
  onAskAgain?: () => void;
}

const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function formatPreviousValue(answer: IAnalyticsAnswer, value: number): string {
  const metricKey = answer.query ? findMetricById(answer.query.metricId)?.metricKey : undefined;
  if (metricKey && COUNT_METRIC_KEYS.has(metricKey)) return value.toLocaleString("pt-BR");
  return formatBRL(value);
}

function SuggestionChips({
  questions,
  onSuggestion,
}: {
  questions: string[];
  onSuggestion?: (question: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSuggestion?.(question)}
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders a single copilot answer (RF-014/RF-016). NEVER renders a number when the
 * answer is unresolved or refused by scope (RNF-001). Resolved answers show a hero
 * number, tonal delta, optional sparkline, context line and source/drill-down.
 */
export function AnalyticsAnswerCard({
  answer,
  onSuggestion,
  onAskAgain,
}: IAnalyticsAnswerCardProps) {
  // Refused by scope — transparent denial, never a number (RF-013).
  if (answer.refusedByScope) {
    return (
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Icon icon="mdi:shield-lock-outline" size={18} className="mt-0.5 shrink-0" />
        <span>Você não tem acesso a esse dado.</span>
      </div>
    );
  }

  // Unresolved (honest "I don't know") — chips, never a number (RF-016).
  if (!answer.resolved) {
    if (answer.errorText) {
      return (
        <div className="flex items-start gap-2 text-sm text-severity-critical">
          <Icon icon="mdi:alert-circle-outline" size={18} className="mt-0.5 shrink-0" />
          <span>{answer.errorText}</span>
        </div>
      );
    }
    const isAmbiguous = answer.ambiguous === true;
    return (
      <div className="text-sm">
        <div className="flex items-start gap-2 text-muted-foreground">
          <Icon icon="mdi:help-circle-outline" size={18} className="mt-0.5 shrink-0" />
          <span>{isAmbiguous ? "Você quer:" : "Ainda não sei responder isso."}</span>
        </div>
        <SuggestionChips questions={answer.suggestions ?? []} onSuggestion={onSuggestion} />
      </div>
    );
  }

  // Resolved with a value.
  const metric = answer.query ? findMetricById(answer.query.metricId) : undefined;
  const comparison = answer.comparison;
  let deltaDirection: "up" | "down" | "flat" = "flat";
  if (comparison) {
    if (comparison.delta > 0) deltaDirection = "up";
    else if (comparison.delta < 0) deltaDirection = "down";
  }
  const deltaIcon =
    deltaDirection === "up"
      ? "mdi:arrow-top-right"
      : deltaDirection === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const deltaClasses =
    deltaDirection === "up"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : deltaDirection === "down"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground";
  const deltaPercentLabel = comparison
    ? `${comparison.deltaPercent > 0 ? "+" : ""}${formatPercent(comparison.deltaPercent)}`
    : "";
  const directionWord =
    deltaDirection === "up" ? "em alta" : deltaDirection === "down" ? "em queda" : "estável";
  const valueSrLabel = `${metric?.label ?? "Valor"} ${answer.formattedValue ?? "—"}${
    comparison ? `, ${directionWord} ${deltaPercentLabel} versus período anterior` : ""
  }`;

  const showSparkline = answer.visual === "sparkline" && (answer.series?.length ?? 0) >= 2;

  return (
    <div className="text-sm">
      {/* Context line */}
      {metric && (
        <p className="mb-1 text-xs text-muted-foreground">
          {metric.label}
          {answer.query?.period && ` · ${formatPeriodLabel(answer.query.period)}`}
          {answer.query?.scope && ` · ${scopeLabel(answer.query.scope)}`}
        </p>
      )}

      {/* Hero value + delta */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight text-foreground">
          {answer.formattedValue ?? "—"}
        </span>
        {comparison && (
          <span
            role="status"
            aria-label={valueSrLabel}
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

      {comparison && (
        <p className="mt-1 text-xs text-muted-foreground">
          vs. {formatPreviousValue(answer, comparison.previousValue)} no período anterior
        </p>
      )}

      {showSparkline && (
        <div className="mt-3">
          <Sparkline series={answer.series!} />
        </div>
      )}

      {/* Footer: source + actions */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-primary/30 pt-2 text-xs">
        {answer.citation ? (
          <Link
            to={answer.citation.drillDownUrl}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:check-decagram-outline" size={14} />
            Ver no painel {answer.citation.source.label}
            <Icon icon="mdi:arrow-right" size={14} />
          </Link>
        ) : (
          <span />
        )}
        {onAskAgain && (
          <button
            type="button"
            onClick={onAskAgain}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Perguntar de novo"
            title="Perguntar de novo"
          >
            <Icon icon="mdi:refresh" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
