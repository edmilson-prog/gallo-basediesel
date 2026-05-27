import { useMemo, useState, useCallback } from "react";
import type { IGoalWithProgress } from "@/features/goals";
import type { IUseCockpitMetricsResult } from "./useCockpitMetrics";

export type CockpitAlertSeverity = "info" | "warning" | "danger";

export type CockpitAlertKind =
  | "churn-spike"
  | "goals-critical"
  | "revenue-below-target"
  | "low-conversion";

export interface ICockpitAlert {
  /** Stable hash to allow per-session dismissal. */
  hash: string;
  kind: CockpitAlertKind;
  severity: CockpitAlertSeverity;
  title: string;
  description: string;
  /** Optional drill-down hint — page label only; click handled by host. */
  drillLabel?: string;
}

export interface IUseCockpitAlertsParams {
  metrics: IUseCockpitMetricsResult;
  activeGoals: IGoalWithProgress[];
  thresholds?: {
    /** Trigger churn alert when churn rises by at least this % vs previous. Default 20. */
    churnSpikePct?: number;
    /** Trigger goals alert when at least this many goals are critical (<50%, <7 days). Default 3. */
    criticalGoalsMin?: number;
    /** Trigger revenue alert when avg goal achievement < this %. Default 70. */
    revenueGoalPctMin?: number;
    /** Trigger conversion alert when conversion rate is below this %. Default 15. */
    conversionRateMin?: number;
  };
}

export interface IUseCockpitAlertsResult {
  alerts: ICockpitAlert[];
  dismiss: (hash: string) => void;
  reset: () => void;
}

const DEFAULTS = {
  churnSpikePct: 20,
  criticalGoalsMin: 3,
  revenueGoalPctMin: 70,
  conversionRateMin: 15,
};

/**
 * Executive-grade alerts derived from cockpit metrics + active goals.
 *
 * Pure computation — never mutates upstream data. Dismissals live in component
 * state (lost on reload), matching the PRD-040 acceptance criteria ("dismissible").
 */
export function useCockpitAlerts(params: IUseCockpitAlertsParams): IUseCockpitAlertsResult {
  const thresholds = { ...DEFAULTS, ...(params.thresholds ?? {}) };
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alerts = useMemo<ICockpitAlert[]>(() => {
    const out: ICockpitAlert[] = [];
    const { kpis } = params.metrics;

    // Churn spike — only triggers when previous value > 0 (meaningful baseline).
    const churnPct = kpis.churnCount.trend.changePct;
    if (churnPct !== null && churnPct >= thresholds.churnSpikePct && kpis.churnCount.previous > 0) {
      out.push({
        hash: `churn-${churnPct}`,
        kind: "churn-spike",
        severity: "danger",
        title: `Churn subiu ${churnPct}% no período`,
        description: `${kpis.churnCount.current} clientes migraram para "perdido" — investigue a carteira.`,
        drillLabel: "Ver carteira",
      });
    }

    // Critical goals — active goals with progress < 50% and ≤ 7 days remaining.
    const criticalGoals = params.activeGoals.filter(
      (g) =>
        g.progress.status !== "concluida" &&
        g.progress.percentage < 50 &&
        g.progress.daysRemaining <= 7,
    );
    if (criticalGoals.length >= thresholds.criticalGoalsMin) {
      out.push({
        hash: `goals-${criticalGoals.length}`,
        kind: "goals-critical",
        severity: "warning",
        title: `${criticalGoals.length} metas críticas para fechar`,
        description: "Metas com menos de 50% atingido e prazo ≤ 7 dias.",
        drillLabel: "Ver metas",
      });
    }

    // Revenue below target — compute weighted average achievement across
    // revenue-metric goals and warn if it sits below the threshold.
    const revenueGoals = params.activeGoals.filter(
      (g) => g.goal.metric === "revenue" && g.progress.status !== "concluida",
    );
    if (revenueGoals.length > 0) {
      const avgPct = Math.round(
        revenueGoals.reduce((acc, g) => acc + g.progress.percentage, 0) / revenueGoals.length,
      );
      if (avgPct < thresholds.revenueGoalPctMin) {
        out.push({
          hash: `revenue-${avgPct}`,
          kind: "revenue-below-target",
          severity: "danger",
          title: `Faturamento em ${avgPct}% da meta agregada`,
          description: `Médias abaixo de ${thresholds.revenueGoalPctMin}% acendem alerta executivo.`,
          drillLabel: "Ver metas",
        });
      }
    }

    // Low conversion — quote → order conversion rate slipping below threshold.
    if (
      kpis.conversionRate.current > 0 &&
      kpis.conversionRate.current < thresholds.conversionRateMin
    ) {
      out.push({
        hash: `conv-${kpis.conversionRate.current}`,
        kind: "low-conversion",
        severity: "warning",
        title: `Conversão de orçamentos em ${kpis.conversionRate.current}%`,
        description: `Abaixo do limite de ${thresholds.conversionRateMin}% — revise o funil comercial.`,
        drillLabel: "Ver vendas",
      });
    }

    return out.filter((a) => !dismissed.has(a.hash));
  }, [
    params.metrics,
    params.activeGoals,
    thresholds.churnSpikePct,
    thresholds.criticalGoalsMin,
    thresholds.revenueGoalPctMin,
    thresholds.conversionRateMin,
    dismissed,
  ]);

  const dismiss = useCallback((hash: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(hash);
      return next;
    });
  }, []);

  const reset = useCallback(() => setDismissed(new Set()), []);

  return { alerts, dismiss, reset };
}
