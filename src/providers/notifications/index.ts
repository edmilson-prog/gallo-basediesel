/**
 * GALLO BASE DIESEL — Public surface of the notifications provider layer (PRD-008).
 *
 * Features MUST consume notifications exclusively through this barrel. Importing
 * factory, implementations, or individual contracts directly is forbidden by
 * the ESLint `no-restricted-imports` rule.
 *
 *   import { useNotifications, NotificationProvidersProvider } from "@/providers/notifications";
 *
 * @see src/providers/data/index.ts (mirror pattern)
 */

// Provider component
export { NotificationProvidersProvider } from "./context";

// Hooks
export { useNotifications } from "./hooks/useNotifications";
export { useUnreadCount } from "./hooks/useUnreadCount";
export { useNotificationPreferences } from "./hooks/useNotificationPreferences";

// Public preference utilities (used by router and preference UI)
export { defaultPreferenceFor, isChannelLocked, isCategoryFullyOptional } from "./preferences/defaults";

// Public domain types (re-exported for consumer convenience)
export type {
  INotification,
  INotificationAction,
  INotificationEntityRef,
  IChannelDelivery,
  INotificationPreference,
  NotificationLifecycle,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  NotificationChannel,
  NotificationRecipientType,
  ChannelDeliveryStatus,
} from "@/shared/types";

// Contract types consumers may need (e.g. filtering)
export type { IListNotificationsParams, IReconcileDerivedInput, INotificationStores } from "./contracts";
