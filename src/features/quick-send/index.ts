/**
 * PRD-027 — Quick Send & Asset Library feature barrel.
 *
 * Plan A exports the pure engines, the i18n bundle and the domain types.
 * Plans B and C append hooks and components (append-only).
 */

// Engines (pure)
export {
  resolvePlaceholders,
  hasUnresolved,
  type IPlaceholderContext,
} from "./engine/placeholderResolver";
export { parseSlash, type ISlashState } from "./engine/slashParser";
export { isSensitiveAsset, canSendSensitiveAsset } from "./engine/assetSensitivity";
export { pickSendableVersion, bumpVersion } from "./engine/assetVersioning";
export { filterAssets, type IAssetFilter } from "./engine/assetFiltering";
export { nextTemperature } from "./engine/temperatureEscalation";
export {
  buildShortRef,
  buildUtm,
  encodeLinkMarker,
  TRACKABLE_LINK_MARKER,
  type ILinkPayload,
} from "./engine/trackableLink";
export { isDue, validateFuture } from "./engine/scheduledSend";
export {
  planComboSend,
  type IComboPlan,
  type IComboPlanItem,
} from "./engine/comboSend";
export {
  encodeProductCard,
  decodeProductCard,
  priceLabel,
  hasImage,
  PRODUCT_CARD_MARKER,
  type IProductCardSnapshot,
} from "./engine/productCardPayload";

// i18n
export { QUICK_SEND_STRINGS } from "./i18n/pt-BR";

// Foundation data hooks (pure data — Plan A)
export { useAssetLibrary } from "./hooks/useAssetLibrary";
export { useQuickReplies } from "./hooks/useQuickReplies";
export { useAssetUsageStats } from "./hooks/useAssetUsageStats";

// Composer & Library surfaces (Plano B — PRD-027)
export { useAssetPickerMode, ASSET_PICKER_MODES, normalizeAssetPickerMode } from "./hooks/useAssetPickerMode";
export type { AssetPickerMode } from "./hooks/useAssetPickerMode";
export { QuickSendBusProvider, useQuickSendBus } from "./hooks/useQuickSendBus";
export type { IPickerRequest } from "./hooks/useQuickSendBus";
export { useSendAsset } from "./hooks/useSendAsset";
export { useSendProductCard, buildProductSnapshot } from "./hooks/useSendProductCard";
export { AssetPicker } from "./components/AssetPicker";
export type { IAssetPickerProps } from "./components/AssetPicker";
export { AssetPickerModeSwitcher } from "./components/AssetPickerModeSwitcher";
export { AssetRow } from "./components/AssetRow";
export { AssetGridCard } from "./components/AssetGridCard";
export { SlashMenu } from "./components/SlashMenu";
export { ComposerStagedAsset } from "./components/ComposerStagedAsset";
export { SnippetField } from "./components/SnippetField";
export { ProductCardBubble } from "./components/ProductCardBubble";
export { ProductSearchDialog } from "./components/ProductSearchDialog";
