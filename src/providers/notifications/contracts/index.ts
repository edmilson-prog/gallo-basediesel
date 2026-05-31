import type { INotificationStore } from "./notifications";
import type { INotificationPreferenceStore } from "./preferences";

export interface INotificationStores {
  notifications: INotificationStore;
  preferences: INotificationPreferenceStore;
}
export type { INotificationStore } from "./notifications";
export type { INotificationPreferenceStore } from "./preferences";
export type { IListNotificationsParams, IReconcileDerivedInput } from "./notifications";
