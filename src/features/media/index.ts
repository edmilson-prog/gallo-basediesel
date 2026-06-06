// Engine (pure, tested)
export { contentHash, mediaHashSeed } from "./engine/contentHash";
export { classifyMedia, type IClassifyMediaInput } from "./engine/classifyMedia";
export {
  computeSourceExpiresAt,
  daysUntilExpiry,
  expiryLabel,
  expiryUrgency,
  sourceExpiry,
  DEFAULT_SOURCE_TTL_DAYS,
  type ExpiryUrgency,
  type SourceExpiryTier,
  type ISourceExpiryView,
} from "./engine/sourceExpiry";
export {
  canViewSensitive,
  statusChipPriority,
  type IMediaViewer,
  type MediaStatusChip,
} from "./engine/sensitiveAccess";
export {
  applyMediaFilters,
  highlightRanges,
  highlightSegments,
  type IHighlightRange,
  type IHighlightSegment,
} from "./engine/mediaFiltering";
export {
  normalizePoint,
  denormalizePoint,
  type IPixelPoint,
  type INormalizedPoint,
  type IBox,
} from "./engine/annotationCoords";

// Inbound (Fase 2)
export {
  useEnsureInboundMedia,
  resolveInboundAsset,
  type InboundAction,
  type IInboundDecision,
} from "./hooks/useEnsureInboundMedia";

// Display utils
export {
  countByKind,
  mediaCounterLabel,
  mediaKindIcon,
  formatBytes,
  type MediaKind,
  type IKindCounts,
} from "./utils/mediaDisplay";

// Gallery surfaces (Plan B)
export { ConversationMediaGallery } from "./components/ConversationMediaGallery";
export { useMediaGallery } from "./hooks/useMediaGallery";
export {
  useMediaViewMode,
  normalizeMediaViewMode,
  MEDIA_VIEW_MODES,
  type MediaViewMode,
} from "./hooks/useMediaViewMode";

// i18n
export { CLASSIFICATION_LABELS, KIND_LABELS, MEDIA_STRINGS } from "./i18n/pt-BR";
