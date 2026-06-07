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

// Plan C — Scheduling (PRD-027)
export {
  useConversationScheduled,
  scheduledSendsQueryKey,
  type IUseConversationScheduledResult,
} from "./hooks/useConversationScheduled";
export { ScheduleSendMenu, type IScheduleSendMenuProps } from "./components/ScheduleSendMenu";
export {
  useScheduleSend,
  type IUseScheduleSendResult,
  type IScheduleSendPayload,
} from "./hooks/useScheduleSend";
export { ScheduledList, type IScheduledListProps } from "./components/ScheduledList";
export { useScheduledSendRunner } from "./hooks/useScheduledSendRunner";
export { TemperatureChip, type ITemperatureChipProps } from "./components/TemperatureChip";
export { LinkOpenIndicator, type ILinkOpenIndicatorProps } from "./components/LinkOpenIndicator";
export { useTrackableLinkSimulation } from "./hooks/useTrackableLinkSimulation";
export { LinkBubble, decodeLinkMarker, type ILinkBubbleProps } from "./components/LinkBubble";
export { useConversationLinks, conversationLinksQueryKey } from "./hooks/useConversationLinks";
export { ComboTray, type IComboTrayProps } from "./components/ComboTray";
export { useComboSend, type IUseComboSendResult } from "./hooks/useComboSend";
export {
  useCopilotAssetHandoff,
  type IUseCopilotAssetHandoffResult,
  type ICopilotAssetSuggestion,
} from "./hooks/useCopilotAssetHandoff";

export { AssetUsageStatsPage, type IAssetUsageStatsPageProps } from "./components/library-admin/AssetUsageStatsPage";
