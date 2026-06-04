import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IAnalyticsAnswer } from "@/shared/types/analytics-copilot";
import { findMetricById } from "../catalog/metricCatalog";

interface IAnalyticsAnswerCardProps {
  answer: IAnalyticsAnswer;
  onSuggestion?: (question: string) => void;
}

/** Count/percentage-style metrics are rendered as plain pt-BR numbers; the rest as BRL. */
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
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders a single copilot answer inside a chat bubble (RF-014/RF-016).
 * Sober container (no heavy shadow). NEVER renders a number when the answer is
 * unresolved or refused by scope (RNF-001 governance + spec §8).
 */
export function AnalyticsAnswerCard({ answer, onSuggestion }: IAnalyticsAnswerCardProps) {
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
  const deltaColor =
    deltaDirection === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : deltaDirection === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const deltaPercentLabel = comparison
    ? `${comparison.deltaPercent > 0 ? "+" : ""}${formatPercent(comparison.deltaPercent)}`
    : "";
  const deltaSrLabel =
    deltaDirection === "up"
      ? `Em alta ${deltaPercentLabel}`
      : deltaDirection === "down"
        ? `Em queda ${deltaPercentLabel}`
        : `Estável ${deltaPercentLabel}`;

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {answer.formattedValue ?? "—"}
        </span>
        {comparison && (
          <span
            role="status"
            aria-label={deltaSrLabel}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              deltaColor,
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

      {answer.citation && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs">
          <Icon icon="mdi:check-decagram-outline" size={14} className="text-primary" />
          <a href={answer.citation.drillDownUrl} className="text-primary hover:underline">
            Fonte: {answer.citation.source.label}
          </a>
        </div>
      )}
    </div>
  );
}
