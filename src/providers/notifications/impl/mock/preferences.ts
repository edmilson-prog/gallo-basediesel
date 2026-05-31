import type { ID, INotificationPreference, NotificationRecipientType } from "@/shared/types";
import { recordAuditLog } from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { readCurrentUserSync } from "@/features/auth/guards";
import type { INotificationPreferenceStore } from "../../contracts/preferences";
import { defaultPreferenceFor } from "../../preferences/defaults";

const FALLBACK_STORE_ID = "store-matriz";
const SYSTEM_ACTOR_ID = "system";

/**
 * In-memory preference store, keyed by recipientId.
 *
 * Preferences are not part of `IBootstrappedDataset` (no seed data) — they are
 * lazily created the first time a recipient customises their settings. A simple
 * Map is appropriate because:
 *   - Preferences are per-session in the mock (reset with the mock store)
 *   - Supabase persistence replaces this in PRD-104+
 */
const prefs = new Map<ID, INotificationPreference>();

function logPreferenceMutation(args: {
  recipientId: ID;
  before?: unknown;
  after: unknown;
  storeId?: ID;
}): void {
  const user = readCurrentUserSync();
  const { currentStoreId } = getCurrentContext();
  void recordAuditLog({
    actorId: user?.id ?? SYSTEM_ACTOR_ID,
    action: "update",
    resource: "notification_preference",
    resourceId: args.recipientId,
    storeId: args.storeId ?? currentStoreId ?? FALLBACK_STORE_ID,
    before: args.before,
    after: args.after,
  });
}

/**
 * Mock implementation of `INotificationPreferenceStore`.
 *
 * `get` returns the saved preference if one exists, otherwise builds the
 * default matrix from `defaultPreferenceFor(recipientType, role)` with the
 * real `recipientId` stamped on it. Never throws on missing data (RF-018).
 *
 * `update` persists into the in-memory map and records an audit entry.
 *
 * @see src/providers/notifications/preferences/defaults.ts
 * @see src/providers/data/impl/mock/_audit.ts (audit delegation pattern)
 */
export const mockNotificationPreferenceStore: INotificationPreferenceStore = {
  async get(
    recipientId: ID,
    recipientType: NotificationRecipientType,
  ): Promise<INotificationPreference> {
    const saved = prefs.get(recipientId);
    if (saved) return saved;

    // Derive the role from the current context to pick the right default matrix
    const { user } = getCurrentContext();
    const role = user?.role?.toLowerCase();

    const defaults = defaultPreferenceFor(recipientType, role);
    return {
      ...defaults,
      recipientId,
    };
  },

  async update(pref: INotificationPreference): Promise<INotificationPreference> {
    const before = prefs.get(pref.recipientId);
    const updated: INotificationPreference = {
      ...pref,
      updatedAt: new Date().toISOString(),
    };
    prefs.set(pref.recipientId, updated);
    logPreferenceMutation({
      recipientId: pref.recipientId,
      before,
      after: updated,
    });
    return updated;
  },
};
