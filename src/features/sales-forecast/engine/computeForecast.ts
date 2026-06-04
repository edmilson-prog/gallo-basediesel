import type {
  ForecastScenarioType,
  IForecast,
  IForecastBreakdown,
  IForecastConfig,
  IForecastInput,
  IForecastScenario,
} from "@/shared/types/forecast";
import type { GoalProgressStatus } from "@/shared/types/goals";
import type { ILead } from "@/shared/types/lead";

/**
 * Probability weight for a single open lead, driven by config.pipelineWeightingMode:
 * - "temperature": temperatureWeights[lead.temperature]
 * - "stage": stageWeights[lead.stage.id] (0 when missing)
 * - "hybrid": average of both; falls back to temperature when the stage weight is missing
 */
function leadWeight(lead: ILead, config: IForecastConfig): number {
  const tempWeight = config.temperatureWeights[lead.temperature];
  if (config.pipelineWeightingMode === "temperature") return tempWeight;

  const stageWeight = config.stageWeights?.[lead.stage.id];
  if (config.pipelineWeightingMode === "stage") return stageWeight ?? 0;

  // hybrid
  if (stageWeight === undefined) return tempWeight;
  return (tempWeight + stageWeight) / 2;
}

function computeWeightedPipeline(openLeads: ILead[], config: IForecastConfig): number {
  return openLeads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0) * leadWeight(lead, config), 0);
}

/**
 * Scenario traffic-light status. Distinguishes "concluida" (already realized >= target)
 * from "no_caminho" (projected to reach target). Reuses GoalProgressStatus (PRD-042).
 */
function scenarioStatus(realized: number, projected: number, target: number | undefined): GoalProgressStatus {
  if (target === undefined || target <= 0) return "no_caminho";
  if (realized >= target) return "concluida";
  if (projected >= target) return "no_caminho";
  if (projected >= target * 0.9) return "atencao";
  return "atrasada";
}

function scaleBreakdown(base: IForecastBreakdown, factor: number): IForecastBreakdown {
  return {
    realized: base.realized * factor,
    weightedPipeline: base.weightedPipeline * factor,
    runRateRemainder: base.runRateRemainder * factor,
  };
}

function buildScenario(
  type: ForecastScenarioType,
  factor: number,
  baseBreakdown: IForecastBreakdown,
  realizedValue: number,
  target: number | undefined,
  avgTicket: number | undefined,
): IForecastScenario {
  const breakdown = scaleBreakdown(baseBreakdown, factor);
  const projectedValue = breakdown.realized + breakdown.weightedPipeline + breakdown.runRateRemainder;
  const status = scenarioStatus(realizedValue, projectedValue, target);

  let gapToTarget: number | undefined;
  let gapPercent: number | undefined;
  let ordersNeeded: number | undefined;
  if (target !== undefined) {
    gapToTarget = target - projectedValue;
    gapPercent = target > 0 ? gapToTarget / target : 0;
    if (avgTicket && avgTicket > 0 && gapToTarget > 0) {
      ordersNeeded = Math.ceil(gapToTarget / avgTicket);
    }
  }

  return { type, projectedValue, gapToTarget, gapPercent, ordersNeeded, status, breakdown };
}

/**
 * Pure, deterministic closing forecast (PRD-056). No React, no fetch, no global clock.
 * Combination of provável (D-1, residual rule):
 *   runRateRaw   = (realized / max(daysElapsed,1)) * daysRemaining
 *   runRateRem   = max(0, runRateRaw - weightedPipeline)   // pipeline has priority, no double-count
 *   provávelBase = realized + weightedPipeline + runRateRem
 * pessimista/otimista scale provávelBase by config.scenarioFactors.
 */
export function computeForecast(input: IForecastInput, config: IForecastConfig): IForecast {
  const { realizedValue, openLeads, target, calendar, metric, period, scope, avgTicket } = input;
  const { daysElapsed, daysRemaining, totalDays } = calendar;

  const weightedPipeline = computeWeightedPipeline(openLeads, config);
  const runRateRaw = (realizedValue / Math.max(daysElapsed, 1)) * daysRemaining;
  const runRateRemainder = Math.max(0, runRateRaw - weightedPipeline);

  const baseBreakdown: IForecastBreakdown = {
    realized: realizedValue,
    weightedPipeline,
    runRateRemainder,
  };

  const targetValue = target?.value;
  const scenarios: IForecastScenario[] = [
    buildScenario("pessimista", config.scenarioFactors.pessimista, baseBreakdown, realizedValue, targetValue, avgTicket),
    buildScenario("provavel", config.scenarioFactors.provavel, baseBreakdown, realizedValue, targetValue, avgTicket),
    buildScenario("otimista", config.scenarioFactors.otimista, baseBreakdown, realizedValue, targetValue, avgTicket),
  ];

  return {
    scope,
    metric,
    period,
    realizedValue,
    targetValue,
    scenarios,
    daysElapsed,
    daysRemaining,
    totalDays,
    lowConfidence: daysElapsed < config.lowConfidenceMinDays,
    computedAt: input.now,
  };
}
