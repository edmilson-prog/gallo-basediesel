export { computeForecast } from "./engine/computeForecast";
export { buildForecastInput, type IBuildForecastInputArgs } from "./engine/buildForecastInput";
export { DEFAULT_FORECAST_CONFIG } from "./engine/defaults";
export {
  useForecast,
  type IUseForecastFilters,
  type IUseForecastResult,
} from "./hooks/useForecast";
export {
  useStoreForecast,
  type ISellerForecast,
  type IUseStoreForecastParams,
  type IUseStoreForecastResult,
} from "./hooks/useStoreForecast";

export { ForecastWidget, type IForecastWidgetProps } from "./components/ForecastWidget";

export { SalesForecastPage } from "./pages/SalesForecastPage";
export { ForecastConfigPage } from "./pages/ForecastConfigPage";
export { validateForecastSearch, type IForecastSearch } from "./pages/forecastSearch";
