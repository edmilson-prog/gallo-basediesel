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

/**
 * Page size used when draining the paginated sibling providers — the max
 * PostgREST allows (`.list()` clamps `pageSize` to 1000 either way).
 *
 * Bigger pages matter here even after the `withTotal: false` fix above:
 * OFFSET-based `.range()` pagination under a row-level RLS predicate
 * (`can_access_conversation`) re-filters every row from the start of the
 * index up to `offset + pageSize` on EACH page — the offset does not skip
 * the filter, only the output. Cumulative filtered-row-count across a full
 * drain is `pageSize * (1 + 2 + ... + numPages)`, so fewer/bigger pages cut
 * total work roughly in proportion (measured ~33s → ~12s for a
 * ~3k-conversation store going from 200-row to 1000-row pages).
 */
const DRAIN_PAGE_SIZE = 1000;

function inWindow(iso: ISO8601, fromIso: ISO8601, toIso: ISO8601): boolean {
  return iso >= fromIso && iso <= toIso;
}

/**
 * Drains every page of a paginated sibling-provider read into a flat array.
 * The dashboard is an aggregate that needs the full scoped set, not a page.
 *
 * Stops as soon as a page comes back short of `DRAIN_PAGE_SIZE` — deliberately
 * NOT based on `result.total`. The conversations drain below opts out of the
 * exact count (`withTotal: false`) because `count: "exact"` re-runs the
 * per-row `can_access_conversation` RLS check over the WHOLE candidate set on
 * EVERY page fetch: measured ~4.1s for a single count on a ~3k-conversation
 * store, so draining 16 pages the old way cost over a minute and left the
 * "Indicadores principais" row (TMA/TMR/Taxa de Resolução/Backlog) stuck on
 * its loading skeleton indefinitely in production.
 */
async function drainPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<IPaginatedResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const result = await fetchPage(page, DRAIN_PAGE_SIZE);
    all.push(...result.data);
    if (result.data.length < DRAIN_PAGE_SIZE) break;
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
          withTotal: false,
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
