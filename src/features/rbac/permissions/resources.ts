/**
 * RBAC resources — canonical, exhaustive list.
 *
 * Every domain entity that can be protected appears here as a string literal.
 * Adding a new resource requires:
 *  1. Adding the literal to this array.
 *  2. Adding role-specific entries to `matrix.ts`.
 *
 * The Supabase RLS layer (Fase 2) maps each entry to a Postgres table (or RPC)
 * and inherits the action / scope semantics defined alongside.
 */
export const RESOURCES = [
  "customer",
  "vehicle",
  "lead",
  "conversation",
  "message",
  "part",
  "vehicleModel",
  "modelKit",
  "quote",
  "order",
  "commission",
  "goal",
  "indicator",
  "recommendation",
  "transfer",
  "segment",
  "seller",
  "store",
  "settings",
  "audit_log",
  "media",
  "role",
  "dre",
  "expense",
  "cashflow",
  "profitability",
  "inventory",
  "customer_service_analytics",
  "insight",
  "storefront_admin",
  "ecommerce_integration",
  "asset_library",
  "quick_reply",
  "trackable_link",
  "scheduled_send",
  // Role administration & monitoring (PRD-211 Task 16). `manage_roles` gates the
  // role editor's write actions; `monitor` is the base for a future "spy mode"
  // (born here as data; behavior is a later DELTA).
  "manage_roles",
  "monitor",
] as const;

export type ResourceName = (typeof RESOURCES)[number];
