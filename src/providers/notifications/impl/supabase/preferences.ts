import type { ID, INotificationPreference, NotificationRecipientType } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import type { INotificationPreferenceStore } from "../../contracts/preferences";
import { defaultPreferenceFor } from "../../preferences/defaults";

/**
 * Supabase implementation of {@link INotificationPreferenceStore} (PRD-104).
 *
 * Backed by `public.notification_preferences` (PK `recipient_id`). `get` never
 * throws on missing data: it returns the role-aware default matrix from
 * `defaultPreferenceFor` (role resolved from the current session, mirroring the
 * mock) with the real `recipientId` stamped on it. RLS lets a recipient read/
 * write only their own row (staff may manage any).
 */

interface PreferenceRow {
  recipient_id: string;
  recipient_type: NotificationRecipientType;
  matrix: INotificationPreference["matrix"];
  quiet_hours: INotificationPreference["quietHours"] | null;
  updated_at: string;
}

const TABLE = "notification_preferences";
const COLUMNS = "recipient_id, recipient_type, matrix, quiet_hours, updated_at";

function rowToPreference(row: PreferenceRow): INotificationPreference {
  return {
    recipientId: row.recipient_id,
    recipientType: row.recipient_type,
    matrix: row.matrix,
    quietHours: row.quiet_hours ?? undefined,
    updatedAt: row.updated_at,
  };
}

export const supabaseNotificationPreferenceStore: INotificationPreferenceStore = {
  async get(
    recipientId: ID,
    recipientType: NotificationRecipientType,
  ): Promise<INotificationPreference> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("recipient_id", recipientId)
      .maybeSingle();
    if (error)
      throw new Error(
        `[supabase] notificationPreferences.get(${recipientId}) failed: ${error.message}`,
      );
    if (data) return rowToPreference(data as PreferenceRow);

    // No saved row → role-aware defaults with the real id stamped (never throws).
    const role = getCurrentContext().user?.role?.toLowerCase();
    return { ...defaultPreferenceFor(recipientType, role), recipientId };
  },

  async update(pref: INotificationPreference): Promise<INotificationPreference> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(
        {
          recipient_id: pref.recipientId,
          recipient_type: pref.recipientType,
          matrix: pref.matrix,
          quiet_hours: pref.quietHours ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "recipient_id" },
      )
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(
        `[supabase] notificationPreferences.update(${pref.recipientId}) failed: ${error.message}`,
      );
    return rowToPreference(data as PreferenceRow);
  },
};
