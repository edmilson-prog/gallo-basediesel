import { NotImplementedError } from "../../errors";
import type { INotificationStore } from "../../contracts/notifications";

const stub = (m: string) => (): never => {
  throw new NotImplementedError(
    `SupabaseNotificationStore.${m} — implementar no PRD-104+ (notificações via Supabase).`,
  );
};

/**
 * Supabase stub for `INotificationStore`.
 *
 * Every method throws `NotImplementedError` immediately. Replace this with a
 * real implementation in PRD-104+ when the Supabase notification tables and
 * RLS policies are in place.
 *
 * @see src/providers/data/impl/supabase/customers.ts (stub pattern)
 */
export const supabaseNotificationStore: INotificationStore = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  unreadCount: stub("unreadCount"),
  markRead: stub("markRead"),
  markAllRead: stub("markAllRead"),
  archive: stub("archive"),
  reconcileDerived: stub("reconcileDerived"),
};
