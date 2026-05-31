import type { INotificationPreference, NotificationRecipientType, ID } from "@/shared/types";

export interface INotificationPreferenceStore {
  /** Returns saved prefs or sensible defaults (never throws on missing). */
  get(recipientId: ID, recipientType: NotificationRecipientType): Promise<INotificationPreference>;
  update(pref: INotificationPreference): Promise<INotificationPreference>;
}
