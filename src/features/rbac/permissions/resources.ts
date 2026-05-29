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
  "quote",
  "order",
  "commission",
  "goal",
  "recommendation",
  "transfer",
  "segment",
  "seller",
  "store",
  "settings",
  "audit_log",
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
] as const;

export type ResourceName = (typeof RESOURCES)[number];
