// Components
export { AttendanceHistoryPanel } from "./components/AttendanceHistoryPanel";
export type { IAttendanceHistoryPanelProps } from "./components/AttendanceHistoryPanel";
// Hooks
export { useCustomerTimeline } from "./hooks/useCustomerTimeline";
// Engines (pure)
export {
  buildCustomerTimeline,
  type TimelineFilter,
  type ITimelineCard,
} from "./engine/customerTimeline";
// Utils (pure)
export { formatDuration } from "./utils/formatDuration";
// i18n
export { ATTENDANCE_HISTORY_STRINGS } from "./i18n/pt-BR";
