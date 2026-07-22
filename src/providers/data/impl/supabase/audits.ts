import type { IAuditLog, ID } from "@/shared/types";
import type { IAuditsProvider, ICreateAuditInput, IListAuditsParams } from "../../contracts/audits";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IAuditsProvider} (PRD-006 / PRD-110+).
 *
 * snake_case `audit_logs` table ↔ camelCase {@link IAuditLog} via `rowToAudit`.
 * The before/after diffs are arbitrary structured payloads stored as jsonb
 * columns and rehydrated verbatim. The log is APPEND-ONLY: there is no
 * `updated_at` and the contract exposes no update/delete — once written, an
 * entry is immutable.
 *
 * RLS (issue #231): `audit_logs_insert` only accepts rows whose `store_id`
 * equals the JWT claim (`current_store_id()`), and `audit_logs_select` is
 * staff/financeiro-only. Because `INSERT ... RETURNING` must also satisfy the
 * SELECT policy, `create` inserts with `return=minimal` (no `.select()`) and
 * echoes the row locally — otherwise every seller insert 403s. The JWT claims
 * also rescue placeholder actors: `actor_id` is a NOT NULL uuid FK to sellers,
 * so a non-UUID actor without a seller claim fails fast instead of 22P02-ing.
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
    const buildQuery = () => {
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

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<AuditLogRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("timestamp", { ascending: false })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] audits.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as AuditLogRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToAudit),
      total,
      page,
      pageSize,
    };
  },

  async create(input: ICreateAuditInput): Promise<IAuditLog> {
    const claims = await getJwtAuditClaims();
    // The INSERT policy only accepts the JWT-scoped store, so the claim wins
    // over the caller-resolved store (which may be a pre-hydration fallback).
    // Deliberate trade-off: under the current RLS, recording under the JWT
    // store is the only alternative to losing the entry; cross-store actions
    // are slated to write through owner RPCs (multistore epic), not here.
    const storeId = claims.storeId ?? input.storeId;
    // actor_id is a NOT NULL uuid FK to sellers. Placeholder actors ("system",
    // pre-hydration ids) can only be rescued by the seller claim; without it
    // the insert is doomed (22P02/23503), so fail fast before the request.
    const actorId = UUID_PATTERN.test(input.actorId) ? input.actorId : claims.sellerId;
    if (!actorId) {
      throw new Error(
        `[supabase] audits.create skipped: actor "${input.actorId}" is not a seller id and no seller claim is available`,
      );
    }
    const id: ID = crypto.randomUUID();
    const row: AuditLogRow = {
      id,
      store_id: storeId,
      actor_id: actorId,
      action: input.action,
      resource: input.resource,
      resource_id: input.resourceId,
      before: input.before ?? null,
      after: input.after ?? null,
      timestamp: new Date().toISOString(),
    };
    // When the claim is unreadable, omit store_id so the DB default
    // (current_store_id(), migration 20260705144622) derives it from the
    // request JWT server-side — the only value the WITH CHECK accepts. The
    // echoed row keeps the caller store as a display best-effort.
    const payload: Partial<AuditLogRow> = { ...row };
    if (claims.storeId === null) delete payload.store_id;
    const { error } = await getSupabaseClient().from(TABLE).insert(payload);
    if (error) throw new Error(`[supabase] audits.create failed: ${error.message}`);
    return rowToAudit(row);
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How long the audit path waits on the auth lock before falling back. */
const SESSION_READ_TIMEOUT_MS = 1_500;

interface IJwtAuditClaims {
  storeId: string | null;
  sellerId: string | null;
}

const NO_CLAIMS: IJwtAuditClaims = { storeId: null, sellerId: null };

/**
 * Reads the audit-relevant claims from the session JWT (`app_metadata.store_id`
 * and `app_metadata.seller_id`, minted by the Custom Access Token Hook).
 *
 * Decodes the token locally on purpose: `auth.getClaims()` may add a network
 * verification round-trip on HS256 projects, and a forged token dies at RLS
 * anyway — these claims only shape the payload, they are not a security
 * boundary. The session read is raced against a short timeout so a held
 * supabase-js auth lock degrades to the caller fallback instead of hanging a
 * fire-and-forget audit. Null fields mean "claim unavailable".
 */
async function getJwtAuditClaims(): Promise<IJwtAuditClaims> {
  try {
    const result = await Promise.race([
      getSupabaseClient().auth.getSession(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS);
      }),
    ]);
    const token = result?.data.session?.access_token;
    if (!token) return NO_CLAIMS;
    const segment = token.split(".")[1];
    if (!segment) return NO_CLAIMS;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as {
      app_metadata?: { store_id?: unknown; seller_id?: unknown };
    };
    return {
      storeId: asNonEmptyString(claims.app_metadata?.store_id),
      sellerId: asNonEmptyString(claims.app_metadata?.seller_id),
    };
  } catch {
    return NO_CLAIMS;
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
