// Components
export { AttendanceHistoryPanel } from "./components/AttendanceHistoryPanel";
export type { IAttendanceHistoryPanelProps } from "./components/AttendanceHistoryPanel";
// Hooks
export { useCustomerActivity } from "./hooks/useCustomerActivity";
// Engines (pure)
export {
  buildAttendanceTimeline,
  type IConversationTimeline,
  type ITimelineNode,
  type ITimelineSummary,
} from "./engine/attendanceTimeline";
// Utils (pure)
export { formatDuration } from "./utils/formatDuration";
// i18n
export { ATTENDANCE_HISTORY_STRINGS } from "./i18n/pt-BR";
