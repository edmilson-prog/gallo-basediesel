// src/features/model-kits/index.ts
// Public barrel for the model-kits feature.
export { ModelKitsSection } from "./components/ModelKitsSection";
export { ModelKitCard } from "./components/ModelKitCard";
export { KitPartLine } from "./components/KitPartLine";
export { ModelCompatiblePartsCard } from "./components/ModelCompatiblePartsCard";
export { useModelKitsOverview } from "./hooks/useModelKitsOverview";
export { useKitApplicationCounts } from "./hooks/useKitApplicationCounts";
export { validateKitEditorSearch, type IKitEditorSearch } from "./utils/kitEditorSearch";
export { KitStatusBadge } from "./components/KitStatusBadge";
export { KitCategoryBadge } from "./components/KitCategoryBadge";
export { KitCoverageBar, type CoverageFilter } from "./components/KitCoverageBar";
export { ModelKitCell } from "./components/ModelKitCell";
export { KitSuggestionBanner } from "./components/KitSuggestionBanner";
// Kit build (direction A — slots per family)
export { KitBuildHeader } from "./components/KitBuildHeader";
export { KitStartFromCard } from "./components/KitStartFromCard";
export { KitFamilySlot, type IKitSlotLine } from "./components/KitFamilySlot";
export { KitEditorPartLine } from "./components/KitEditorPartLine";
export { KitCatalogPanel } from "./components/KitCatalogPanel";
export { KitAlsoForCard } from "./components/KitAlsoForCard";
export { KitSaveBar } from "./components/KitSaveBar";
export { useKitDraft, type IKitDraft } from "./hooks/useKitDraft";
export { ModelKitFormPage } from "./pages/ModelKitFormPage";
export { ApplyKitDialog } from "./components/ApplyKitDialog";
export type { IApplyKitDialogProps, IApplyKitSelection } from "./components/ApplyKitDialog";
