import type {
  ConversationChannel,
  ICustomer,
  IConversation,
  IMessage,
  ISeller,
  ID,
  ISO8601,
} from "@/shared/types";

/**
 * Parameters of an `IManagerDashboardProvider.snapshot` call.
 *
 * The same provider call returns both current-window and previous-window data
 * so the dashboard can render KPIs side-by-side with trends without firing two
 * separate requests.
 */
export interface IManagerDashboardSnapshotParams {
  /** Restrict to a single store, or omit for cross-store (Owner). */
  storeId?: ID;
  /** Restrict to conversations / messages assigned to one seller. */
  sellerId?: ID;
  /** Restrict to a single conversation channel. */
  channel?: ConversationChannel;
  /** Current window — inclusive ISO8601 bounds. */
  fromIso: ISO8601;
  toIso: ISO8601;
  /** Previous window — paired bounds for trend comparison. */
  prevFromIso: ISO8601;
  prevToIso: ISO8601;
}

/**
 * Aggregated read returned by `IManagerDashboardProvider.snapshot`. Everything
 * the manager dashboard needs to render comes back in a single payload — fewer
 * round-trips, simpler real-time invalidation, and a natural fit for the
 * Supabase phase (materialized view / RPC).
 */
export interface IManagerDashboardSnapshot {
  /**
   * Currently-open conversations — `aguardando`, `em_andamento`, `aguardando_cliente`.
   * Filtered by the params except for the time window (current state, not historical).
   */
  openConversations: IConversation[];
  /** Sellers in scope (store-filtered when applicable). */
  sellers: ISeller[];
  /**
   * Customers in scope (store-filtered when applicable). Drives the carteira
   * health donut and the "Cliente A dormente" alert.
   */
  customers: ICustomer[];
  /** Conversations whose lifecycle overlapped the current window. */
  conversationsInPeriod: IConversation[];
  /** Messages exchanged inside the current window (any direction). */
  messagesInPeriod: IMessage[];
  /** Conversations whose lifecycle overlapped the previous window (trend). */
  conversationsInPrev: IConversation[];
  /** Messages exchanged inside the previous window (trend). */
  messagesInPrev: IMessage[];
}

/**
 * Aggregate-read provider for the operational manager dashboard (PRD-014).
 *
 * Each method returns the snapshot needed by a section of the panel; consumers
 * combine them through dedicated hooks (`useTma`, `useTmr`, …) to keep
 * derived calculations close to React state.
 */
export interface IManagerDashboardProvider {
  snapshot(params: IManagerDashboardSnapshotParams): Promise<IManagerDashboardSnapshot>;
}
