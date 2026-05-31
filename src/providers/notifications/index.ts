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
export { useNotificationMutations } from "./hooks/useNotificationMutations";
export type { IUseNotificationMutationsResult } from "./hooks/useNotificationMutations";

// Public preference utilities (used by router and preference UI)
export {
  defaultPreferenceFor,
  isChannelLocked,
  isCategoryFullyOptional,
} from "./preferences/defaults";

// Shared derived-condition logic (PRD-014 ⇄ PRD-008): the manager dashboard and
// the reconciler compute the same conditions from this single source of truth.
export {
  buildClienteADormenteAlerts,
  buildVendedorSobrecarregadoAlerts,
  buildConversaSemRespostaAlerts,
} from "./conditions/derivedConditions";
export type { IActiveAlert, AlertSeverity, AlertKind } from "./conditions/derivedConditions";

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
export type {
  IListNotificationsParams,
  IReconcileDerivedInput,
  INotificationStores,
} from "./contracts";
