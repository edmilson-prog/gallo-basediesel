// Pure business logic for the canonical vehicle-model catalog — no React, no data access.
export {
  getSiblingModels,
  groupModelsByBrand,
  isSiblingModel,
  type IBrandGroup,
  type IEngineBlock,
  type IGroupableModel,
} from "./modelGrouping";
