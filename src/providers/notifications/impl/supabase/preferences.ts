import { NotImplementedError } from "../../errors";
import type { INotificationPreferenceStore } from "../../contracts/preferences";

const stub = (m: string) => (): never => {
  throw new NotImplementedError(
    `SupabaseNotificationPreferenceStore.${m} — implementar no PRD-104+ (notificações via Supabase).`,
  );
};

/**
 * Supabase stub for `INotificationPreferenceStore`.
 *
 * Every method throws `NotImplementedError` immediately. Replace this with a
 * real implementation in PRD-104+ when the Supabase `notification_preferences`
 * table and RLS policies are in place.
 *
 * @see src/providers/data/impl/supabase/customers.ts (stub pattern)
 */
export const supabaseNotificationPreferenceStore: INotificationPreferenceStore = {
  get: stub("get"),
  update: stub("update"),
};
