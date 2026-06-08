import type { IConversation, ICustomer, ISeller, ID, ISO8601 } from "@/shared/types";
import type {
  IManagerDashboardProvider,
  IManagerDashboardSnapshot,
  IManagerDashboardSnapshotParams,
} from "../../contracts/managerDashboard";
import type { IPaginatedResult } from "../../contracts/_shared";
import { supabaseConversationsProvider } from "./conversations";
import { supabaseCustomersProvider } from "./customers";
import { supabaseMessagesProvider } from "./messages";
import { supabaseSellersProvider } from "./sellers";

/**
 * Supabase implementation of {@link IManagerDashboardProvider} (PRD-014).
 *
 * COMPUTED / aggregate provider — it owns no table of its own. The operational
 * manager dashboard is a derived read over four existing collections
 * (conversations, sellers, customers, messages), so this implementation simply
 * COMPOSES the sibling Supabase providers and reproduces the pure in-memory
 * shaping the mock applies (`src/mocks/api/managerDashboard.ts`):
 *
 *  - scope filter (storeId / sellerId / channel) is pushed into
 *    `conversations.list`; the open / current-window / previous-window buckets
 *    are partitioned client-side from the same scoped fetch so the three views
 *    stay perfectly consistent (identical to the mock's single `scoped` pass);
 *  - sellers / customers are store-filtered only (sellerId / channel never
 *    apply to them in the mock);
 *  - messages are joined through the scoped conversation id set via
 *    `messages.listForAnalytics({ conversationIds, since, until })`, mirroring
 *    the mock's inclusive `sentAt` window join.
 *
 * Every underlying read works today under the temporary permissive RLS, so this
 * aggregate is functional in the current POC phase. A later phase may collapse
 * it into a single materialized view / RPC for fewer round-trips; until then,
 * composition keeps the semantics identical to Fase 1 with zero duplicated SQL.
 */

const OPEN_STATUSES = new Set<IConversation["status"]>([
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
]);

/** Page size used when draining the paginated sibling providers. */
const DRAIN_PAGE_SIZE = 200;

function inWindow(iso: ISO8601, fromIso: ISO8601, toIso: ISO8601): boolean {
  return iso >= fromIso && iso <= toIso;
}

/**
 * Drains every page of a paginated sibling-provider read into a flat array.
 * The dashboard is an aggregate that needs the full scoped set, not a page.
 */
async function drainPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<IPaginatedResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  // Hard cap iterations defensively; `total` bounds the loop in practice.
  for (;;) {
    const result = await fetchPage(page, DRAIN_PAGE_SIZE);
    all.push(...result.data);
    const fetched = page * result.pageSize;
    if (result.data.length === 0 || fetched >= result.total) break;
    page += 1;
  }
  return all;
}

export const supabaseManagerDashboardProvider: IManagerDashboardProvider = {
  async snapshot(params: IManagerDashboardSnapshotParams): Promise<IManagerDashboardSnapshot> {
    try {
      // Sellers / customers are store-filtered only (sellerId / channel never
      // narrow them in the mock).
      const sellersList: ISeller[] = await supabaseSellersProvider.list(
        params.storeId ? { storeId: params.storeId } : undefined,
      );

      const customers: ICustomer[] = await drainPages<ICustomer>((page, pageSize) =>
        supabaseCustomersProvider.list({
          ...(params.storeId ? { storeId: params.storeId } : {}),
          page,
          pageSize,
        }),
      );

      // Conversations: push the scope filter (storeId / sellerId / channel) into
      // the query, then partition the buckets client-side from one scoped fetch
      // — keeping open / period / prev perfectly consistent (mirrors the mock).
      const scoped: IConversation[] = await drainPages<IConversation>((page, pageSize) =>
        supabaseConversationsProvider.list({
          ...(params.storeId ? { storeId: params.storeId } : {}),
          ...(params.sellerId ? { assignedSellerId: params.sellerId } : {}),
          ...(params.channel ? { channel: params.channel } : {}),
          page,
          pageSize,
        }),
      );

      const conversationIds: ID[] = scoped.map((c) => c.id);

      // Open conversations — current state, ignores the time window.
      const openConversations = scoped.filter((c) => OPEN_STATUSES.has(c.status));

      // Period buckets — conversation active when its lastMessageAt fell in window.
      const conversationsInPeriod = scoped.filter((c) =>
        inWindow(c.lastMessageAt, params.fromIso, params.toIso),
      );
      const conversationsInPrev = scoped.filter((c) =>
        inWindow(c.lastMessageAt, params.prevFromIso, params.prevToIso),
      );

      // Messages — join through the scoped conversation id set, inclusive
      // `sentAt` window (matches the mock's `inWindow`). Skip the round-trips
      // entirely when no conversation is in scope.
      const [messagesInPeriod, messagesInPrev] =
        conversationIds.length === 0
          ? [[], []]
          : await Promise.all([
              supabaseMessagesProvider.listForAnalytics({
                conversationIds,
                since: params.fromIso,
                until: params.toIso,
              }),
              supabaseMessagesProvider.listForAnalytics({
                conversationIds,
                since: params.prevFromIso,
                until: params.prevToIso,
              }),
            ]);

      return {
        openConversations,
        sellers: sellersList,
        customers,
        conversationsInPeriod,
        messagesInPeriod,
        conversationsInPrev,
        messagesInPrev,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[supabase] managerDashboard.snapshot failed: ${message}`);
    }
  },
};
