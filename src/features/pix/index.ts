export { CopyKeyButton } from "./components/CopyKeyButton";
export { ComposerStagedPix, type IComposerStagedPixProps } from "./components/ComposerStagedPix";
export { PixKeysPage } from "./components/admin/PixKeysPage";
export { usePixKeys, type IUsePixKeys } from "./hooks/usePixKeys";
export { useSendPix, type IPixSendOptions, type IUseSendPixResult } from "./hooks/useSendPix";
export { usePixKeyAdmin, type IUsePixKeyAdmin, type PixKeyDraft } from "./hooks/usePixKeyAdmin";
export { PIX_STRINGS, PIX_TYPE_LABEL, PIX_TYPE_ICON, PIX_TYPE_PLACEHOLDER } from "./i18n/pt-BR";
// Consumers outside the feature (the composer's slash menu) need the readable
// form for labels. The canonical value stays the one that is sent and copied.
export { toDisplayPixKey } from "./engine/pixKeyFormat";
