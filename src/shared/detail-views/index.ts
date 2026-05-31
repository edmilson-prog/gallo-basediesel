export {
  type DetailLayout,
  DETAIL_LAYOUTS,
  DEFAULT_DETAIL_LAYOUT,
  QUOTE_DETAIL_LAYOUT_KEY,
  ORDER_DETAIL_LAYOUT_KEY,
  DETAIL_LAYOUT_LABELS,
  DETAIL_LAYOUT_ICONS,
  DETAIL_LAYOUT_HINTS,
} from "./config";
export { useDetailLayout } from "./useDetailLayout";
export { DetailLayoutSwitcher, type IDetailLayoutSwitcherProps } from "./DetailLayoutSwitcher";
export {
  DetailStatStrip,
  type IDetailStat,
  type IDetailStatStripProps,
  type StatTone,
} from "./DetailStatStrip";
export {
  StatusStepper,
  type IStepperStep,
  type IStepperTerminal,
  type IStatusStepperProps,
} from "./StatusStepper";
export { DetailCard, type IDetailCardProps } from "./DetailCard";
export { DetailSummaryCard, type IDetailSummaryCardProps } from "./DetailSummaryCard";
export { DetailCustomerCard, type IDetailCustomerCardProps } from "./DetailCustomerCard";
export { DetailHistory, type IDetailHistoryEntry, type IDetailHistoryProps } from "./DetailHistory";
export { CockpitShell, OperationalShell, DocumentShell } from "./LayoutShells";
