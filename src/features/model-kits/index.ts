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
export { KitCatalogSearch } from "./components/KitCatalogSearch";
export { KitItemEditorRow } from "./components/KitItemEditorRow";
export { KitDriftBanner } from "./components/KitDriftBanner";
export { KitSuggestionBanner } from "./components/KitSuggestionBanner";
export { ModelKitFormPage } from "./pages/ModelKitFormPage";
export { ApplyKitDialog } from "./components/ApplyKitDialog";
export type { IApplyKitDialogProps, IApplyKitSelection } from "./components/ApplyKitDialog";
