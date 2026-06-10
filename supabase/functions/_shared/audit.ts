/** Best-effort audit logging — never fails the request (PRD-102). */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export interface AuditEntry {
  store_id: string;
  actor_id: string;
  action: string;
  resource: string;
  resource_id: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function bestEffortAudit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await admin.from("audit_logs").insert(entry);
  } catch (_) {
    // ignore audit failures — auditing must never break the main operation
  }
}
