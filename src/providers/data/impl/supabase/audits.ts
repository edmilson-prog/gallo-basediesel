import type { IAuditLog, ID } from "@/shared/types";
import type { IAuditsProvider, ICreateAuditInput, IListAuditsParams } from "../../contracts/audits";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IAuditsProvider} (PRD-006 / PRD-110+).
 *
 * snake_case `audit_logs` table ↔ camelCase {@link IAuditLog} via `rowToAudit`.
 * The before/after diffs are arbitrary structured payloads stored as jsonb
 * columns and rehydrated verbatim. The log is APPEND-ONLY: there is no
 * `updated_at` and the contract exposes no update/delete — once written, an
 * entry is immutable. On Fase 2 the table is locked down with an INSERT-only
 * write policy and a DELETE-forbidding policy (PRD-103); for now only the
 * temporary permissive SELECT policy is in place, so reads work and inserts
 * succeed under the POC role.
 */

interface AuditLogRow {
  id: string;
  store_id: string;
  actor_id: string;
  action: string;
  resource: string;
  resource_id: string;
  before: unknown;
  after: unknown;
  timestamp: string;
}

const TABLE = "audit_logs";
const COLUMNS = "id, store_id, actor_id, action, resource, resource_id, before, after, timestamp";

function rowToAudit(row: AuditLogRow): IAuditLog {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    timestamp: row.timestamp,
    storeId: row.store_id,
  };
}

export const supabaseAuditsProvider: IAuditsProvider = {
  async list(params: IListAuditsParams = {}): Promise<IPaginatedResult<IAuditLog>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

    if (params.actorIds && params.actorIds.length > 0) {
      query = query.in("actor_id", params.actorIds);
    } else if (params.actorId !== undefined) {
      query = query.eq("actor_id", params.actorId);
    }

    if (params.resources && params.resources.length > 0) {
      query = query.in("resource", params.resources);
    } else if (params.resource !== undefined) {
      query = query.eq("resource", params.resource);
    }

    if (params.resourceId !== undefined) query = query.eq("resource_id", params.resourceId);

    if (params.actions && params.actions.length > 0) {
      query = query.in("action", params.actions);
    } else if (params.action !== undefined) {
      query = query.eq("action", params.action);
    }

    if (params.since !== undefined) query = query.gte("timestamp", params.since);
    if (params.until !== undefined) query = query.lte("timestamp", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] audits.list failed: ${error.message}`);

    return {
      data: (data as unknown as AuditLogRow[]).map(rowToAudit),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(input: ICreateAuditInput): Promise<IAuditLog> {
    const id: ID = `audit-${crypto.randomUUID()}`;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        id,
        store_id: input.storeId,
        actor_id: input.actorId,
        action: input.action,
        resource: input.resource,
        resource_id: input.resourceId,
        before: input.before ?? null,
        after: input.after ?? null,
        timestamp: new Date().toISOString(),
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] audits.create failed: ${error.message}`);
    return rowToAudit(data as unknown as AuditLogRow);
  },
};
