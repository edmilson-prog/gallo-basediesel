// Pure business logic for model kits — no React, no data access.
export {
  CATEGORY_FAMILIES,
  KIT_FAMILIES,
  getFamilyCoverage,
  resolvePartFamily,
  type IFamilyCoverage,
  type IFamilyCoverageEntry,
  type IFamilyResolvable,
  type IKitFamilyMeta,
  type KitFamily,
} from "./kitFamilies";
export {
  computeKitTotals,
  getStockState,
  type IKitTotals,
  type IKitTotalsLine,
  type IKitTotalsPart,
  type IStockState,
  type StockTone,
} from "./kitTotals";
export { renameKitForModel, type IKitRenameTarget } from "./kitCopy";
export { KIT_CATEGORY_CONFIG } from "./kitCategories";
export {
  computeKitCoverage,
  getModelCoverageStatus,
  groupKitsByModel,
  pickRepresentativeKit,
  sortKitsByCuration,
  type ICoverageKit,
  type IKitCoverage,
  type ModelCoverageStatus,
} from "./kitCoverage";
export {
  findAlsoForCandidates,
  findStartFromCandidates,
  type IAlsoForCandidate,
  type ICandidateKit,
  type ICandidateKitItem,
  type ICandidateModel,
  type IStartFromCandidate,
} from "./kitCandidates";
export {
  applicationMatchesModel,
  brandMatches,
  modelDesignationMatches,
  type IApplicationLike,
  type ICanonicalModelLike,
} from "./modelApplicationMatch";
