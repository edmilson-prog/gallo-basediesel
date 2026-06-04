import type { IForecastConfig } from "@/shared/types/forecast";

/** Ratified defaults (spec D-3/D-4). Tunable later via the config surface. */
export const DEFAULT_FORECAST_CONFIG: IForecastConfig = {
  temperatureWeights: { frio: 0.1, morno: 0.4, quente: 0.75 },
  scenarioFactors: { pessimista: 0.85, provavel: 1.0, otimista: 1.15 },
  pipelineWeightingMode: "temperature",
  lowConfidenceMinDays: 3,
};
