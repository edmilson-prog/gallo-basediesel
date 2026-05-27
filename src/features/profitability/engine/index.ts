export {
  calculateProfitability,
  calculateCoverage,
  profitabilityByProduct,
  profitabilityByCategory,
  profitabilityByCustomer,
  profitabilityBySeller,
  profitabilitySummary,
  classifyMargin,
  PROFITABILITY_THRESHOLDS,
} from "./calculateProfitability";
export type {
  ProfitabilityDimension,
  ProfitabilityHealth,
  IProfitabilityRowBase,
  IProductProfitabilityRow,
  ICategoryProfitabilityRow,
  ICustomerProfitabilityRow,
  ISellerProfitabilityRow,
  IProfitabilityCoverage,
  IProfitabilitySummary,
  IProfitabilityEngineContext,
} from "./calculateProfitability";
