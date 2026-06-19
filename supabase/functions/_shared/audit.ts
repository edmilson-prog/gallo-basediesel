/** Best-effort audit logging — never fails the request (PRD-102). */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export interface AuditEntry {
  store_id: string;
  /**
   * The acting seller's id — an FK to sellers(id). Pass the caller's
   * `profile.seller_id` (NOT their auth.users id). Null when the caller has no
   * linked seller; the audit is then skipped rather than violating the FK.
   */
  actor_id: string | null;
  action: string;
  resource: string;
  resource_id: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function bestEffortAudit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  // actor_id is a NOT NULL FK to sellers(id); skip cleanly when absent instead of
  // attempting an FK-violating insert that would just be swallowed below.
  if (!entry.actor_id) return;
  try {
    await admin.from("audit_logs").insert(entry);
  } catch (_) {
    // ignore audit failures — auditing must never break the main operation
  }
}
