import type {
  IChannelDelivery,
  ID,
  INotification,
  INotificationAction,
  INotificationEntityRef,
  NotificationCategory,
  NotificationChannel,
  NotificationLifecycle,
  NotificationRecipientType,
  NotificationSeverity,
  NotificationStatus,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { NotificationEventType } from "../../events";
import type {
  INotificationStore,
  IListNotificationsParams,
  IReconcileDerivedInput,
} from "../../contracts/notifications";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Supabase implementation of {@link INotificationStore} (PRD-104).
 *
 * Backed by the `public.notifications` table. The RBAC recipient scope that the
 * mock enforces in `_scope.ts` is here enforced by RLS (PRD-103 helpers): staff
 * (owner/manager) see/manage the whole store, a recipient sees/manages only
 * their own rows. So this provider just issues the queries — no in-app scoping.
 *
 * `reconcileDerived` keys derived notifications by `dedupe_key` (the deterministic
 * `notif-${dedupeKey}` id the reconciler mints is NOT a uuid and is ignored — the
 * DB generates the uuid). A condition that disappears is archived; one that
 * reappears is reactivated; one that persists is left as-is (so a read alert is
 * not flipped back to unread on every poll — a small, deliberate improvement
 * over the mock's replace-by-id semantics). Single-client reconcile, so the
 * lookup→insert is race-free for the MVP.
 */

interface NotificationRow {
  id: string;
  dedupe_key: string;
  lifecycle: NotificationLifecycle;
  type: NotificationEventType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  recipient_id: string;
  recipient_type: NotificationRecipientType;
  store_id: string | null;
  title: string;
  body: string | null;
  entity_ref: INotificationEntityRef | null;
  actions: INotificationAction[] | null;
  status: NotificationStatus;
  channels: NotificationChannel[];
  delivery_status: IChannelDelivery[] | null;
  group_key: string | null;
  source: INotification["source"];
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
}

const TABLE = "notifications";
const COLUMNS =
  "id, dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type, store_id, title, body, entity_ref, actions, status, channels, delivery_status, group_key, source, created_at, read_at, expires_at, metadata";

function rowToNotification(row: NotificationRow): INotification {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    lifecycle: row.lifecycle,
    type: row.type,
    category: row.category,
    severity: row.severity,
    recipientId: row.recipient_id,
    recipientType: row.recipient_type,
    storeId: row.store_id ?? undefined,
    title: row.title,
    body: row.body ?? undefined,
    entityRef: row.entity_ref ?? undefined,
    actions: row.actions ?? undefined,
    status: row.status,
    channels: row.channels,
    deliveryStatus: row.delivery_status ?? undefined,
    groupKey: row.group_key ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

/** Maps a notification to an insert row. `id`/`createdAt` are left to the DB
 *  (uuid + default now()); jsonb/array fields pass through supabase-js. */
function toInsertRow(n: Omit<INotification, "id" | "createdAt">): Record<string, unknown> {
  return {
    dedupe_key: n.dedupeKey,
    lifecycle: n.lifecycle,
    type: n.type,
    category: n.category,
    severity: n.severity,
    recipient_id: n.recipientId,
    recipient_type: n.recipientType,
    store_id: n.storeId ?? null,
    title: n.title,
    body: n.body ?? null,
    entity_ref: n.entityRef ?? null,
    actions: n.actions ?? null,
    status: n.status,
    channels: n.channels ?? [],
    delivery_status: n.deliveryStatus ?? null,
    group_key: n.groupKey ?? null,
    source: n.source,
    metadata: n.metadata ?? null,
  };
}

/** Builds a quoted PostgREST list literal: `("a","b")` (for `.not(col,"in",…)`). */
function inList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;
}

export const supabaseNotificationStore: INotificationStore = {
  async list(params: IListNotificationsParams = {}): Promise<IPaginatedResult<INotification>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.recipientId !== undefined) query = query.eq("recipient_id", params.recipientId);
    if (params.categories && params.categories.length > 0)
      query = query.in("category", params.categories);
    if (params.statuses && params.statuses.length > 0) query = query.in("status", params.statuses);
    if (params.severities && params.severities.length > 0)
      query = query.in("severity", params.severities);
    if (params.activeOnly)
      query = query.or(`expires_at.is.null,expires_at.gt."${new Date().toISOString()}"`);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`[supabase] notifications.list failed: ${error.message}`);

    return {
      data: (data as unknown as NotificationRow[]).map(rowToNotification),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<INotification> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] notifications.get(${id}) failed: ${error.message}`);
    return rowToNotification(data as NotificationRow);
  },

  async create(
    input: Omit<INotification, "id" | "createdAt" | "status"> & { status?: NotificationStatus },
  ): Promise<INotification> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(toInsertRow({ ...input, status: input.status ?? "unread" }))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] notifications.create failed: ${error.message}`);
    return rowToNotification(data as NotificationRow);
  },

  async unreadCount(recipientId?: ID): Promise<number> {
    let query = getSupabaseClient()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("status", "unread");
    if (recipientId !== undefined) query = query.eq("recipient_id", recipientId);
    const { count, error } = await query;
    if (error) throw new Error(`[supabase] notifications.unreadCount failed: ${error.message}`);
    return count ?? 0;
  },

  async markRead(id: ID): Promise<INotification> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] notifications.markRead(${id}) failed: ${error.message}`);
    return rowToNotification(data as NotificationRow);
  },

  async markAllRead(recipientId?: ID): Promise<number> {
    let query = getSupabaseClient()
      .from(TABLE)
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("status", "unread");
    if (recipientId !== undefined) query = query.eq("recipient_id", recipientId);
    const { data, error } = await query.select("id");
    if (error) throw new Error(`[supabase] notifications.markAllRead failed: ${error.message}`);
    return (data as { id: string }[]).length;
  },

  async archive(id: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "archived" })
      .eq("id", id);
    if (error) throw new Error(`[supabase] notifications.archive(${id}) failed: ${error.message}`);
  },

  async reconcileDerived(input: IReconcileDerivedInput): Promise<void> {
    const client = getSupabaseClient();
    const nowIso = new Date().toISOString();

    // 1) Expire derived notifications in scope whose dedupe_key is no longer valid.
    if (input.recipientScope.length > 0) {
      let expire = client
        .from(TABLE)
        .update({ status: "archived", expires_at: nowIso })
        .eq("lifecycle", "derived")
        .in("recipient_id", input.recipientScope)
        .neq("status", "archived");
      if (input.keepKeys.length > 0) {
        expire = expire.not("dedupe_key", "in", inList(input.keepKeys));
      }
      const { error } = await expire;
      if (error)
        throw new Error(
          `[supabase] notifications.reconcileDerived (expire) failed: ${error.message}`,
        );
    }

    if (input.upsert.length === 0) return;

    // 2) Look up which dedupe_keys already exist (and their status).
    const keys = input.upsert.map((n) => n.dedupeKey);
    const { data: existing, error: lookupError } = await client
      .from(TABLE)
      .select("id, dedupe_key, status")
      .eq("lifecycle", "derived")
      .in("dedupe_key", keys);
    if (lookupError)
      throw new Error(
        `[supabase] notifications.reconcileDerived (lookup) failed: ${lookupError.message}`,
      );

    const byKey = new Map<string, { id: string; status: NotificationStatus }>();
    for (const r of existing as { id: string; dedupe_key: string; status: NotificationStatus }[]) {
      byKey.set(r.dedupe_key, { id: r.id, status: r.status });
    }

    // 3) Insert genuinely new ones; reactivate archived ones; leave active ones.
    const toInsert: Record<string, unknown>[] = [];
    const toReactivate: string[] = [];
    for (const notification of input.upsert) {
      // Defensive: `recipient_id` is NOT NULL in the DB. A derived notification
      // with no resolvable recipient (e.g. a store without a manager) is dropped
      // rather than failing the whole reconcile pass.
      if (!notification.recipientId) continue;
      const found = byKey.get(notification.dedupeKey);
      if (!found) {
        toInsert.push(toInsertRow(notification));
      } else if (found.status === "archived") {
        toReactivate.push(found.id);
      }
    }

    if (toInsert.length > 0) {
      const { error } = await client.from(TABLE).insert(toInsert);
      if (error)
        throw new Error(
          `[supabase] notifications.reconcileDerived (insert) failed: ${error.message}`,
        );
    }
    if (toReactivate.length > 0) {
      const { error } = await client
        .from(TABLE)
        .update({ status: "unread", expires_at: null })
        .in("id", toReactivate);
      if (error)
        throw new Error(
          `[supabase] notifications.reconcileDerived (reactivate) failed: ${error.message}`,
        );
    }
  },
};
