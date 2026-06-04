import type { ID, ISO8601, Money } from "./common";
import type { GoalLevel, GoalMetric, IGoalPeriod } from "./bi";
import type { GoalProgressStatus } from "./goals";
import type { ILead } from "./lead";

/** Three deterministic scenarios projected for the period close. */
export type ForecastScenarioType = "pessimista" | "provavel" | "otimista";

/** Metrics supported by the forecast MVP (D-5). */
export type ForecastMetric = Extract<GoalMetric, "revenue" | "tickets">;

/** How open pipeline is weighted into the forecast. */
export type PipelineWeightingMode = "temperature" | "stage" | "hybrid";

/** Composition of a projected value: already realized + weighted pipeline + residual run-rate. */
export interface IForecastBreakdown {
  realized: Money;
  weightedPipeline: Money;
  /** Run-rate contribution AFTER the residual rule (max(0, runRate - weightedPipeline)). */
  runRateRemainder: Money;
}

export interface IForecastScenario {
  type: ForecastScenarioType;
  projectedValue: Money;
  /** target - projected; negative means above target. Undefined when there is no goal. */
  gapToTarget?: Money;
  gapPercent?: number;
  /** Orders still needed to reach the target (when avgTicket is known and a gap exists). */
  ordersNeeded?: number;
  /** Traffic-light status reusing PRD-042 semantics. */
  status: GoalProgressStatus;
  breakdown: IForecastBreakdown;
}

export interface IForecastScope {
  level: GoalLevel;
  targetId: ID;
  storeId: ID;
  sellerId?: ID;
}

export interface IForecast {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  targetValue?: Money;
  scenarios: IForecastScenario[];
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  lowConfidence: boolean;
  computedAt: ISO8601;
}

export interface ITemperatureWeights {
  frio: number;
  morno: number;
  quente: number;
}

export interface IScenarioFactors {
  pessimista: number;
  provavel: number;
  otimista: number;
}

export interface IForecastConfig {
  temperatureWeights: ITemperatureWeights;
  scenarioFactors: IScenarioFactors;
  pipelineWeightingMode: PipelineWeightingMode;
  /** Weight per lead-stage id; used when pipelineWeightingMode is "stage" or "hybrid". */
  stageWeights?: Record<ID, number>;
  /** Below this many elapsed days, the forecast is flagged low-confidence. */
  lowConfidenceMinDays: number;
}

export interface IForecastInput {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  /** Average ticket for the period; enables ordersNeeded. */
  avgTicket?: Money;
  /** Open opportunities of the scope (already filtered to "open"). */
  openLeads: ILead[];
  /** Active goal target for the scope, if any. */
  target?: { value: Money };
  calendar: { daysElapsed: number; daysRemaining: number; totalDays: number };
  /** Injected "now" so the engine stays deterministic (RNF-002). */
  now: ISO8601;
}
