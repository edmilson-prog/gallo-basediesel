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
  "contact",
  "vehicle",
  "lead",
  // Funnel ADMINISTRATION — creating, renaming, editing stages, granting
  // access, archiving. Distinct from reaching a funnel, which is governed by
  // `lead_funnel_access` and is not an RBAC concern.
  "funnel",
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
  "service_volume",
  "nps",
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
  // Settings areas that used to be governed by hardcoded role allowlists in
  // SettingsLayout/route guards, which made them invisible to the Role Editor.
  // One resource per administrative domain — deliberately coarser than
  // one-per-screen so the matrix stays readable.
  "settings_users",
  // `view` reaches Templates WhatsApp; `edit` reaches the WhatsApp accounts
  // screen (connecting/removing instances is a heavier action).
  "settings_whatsapp",
  "settings_api_keys",
  "settings_ai",
  "settings_sdr",
  // Idle alerts, conversation rescue, echo continuity and notification sounds —
  // the automations that act on conversations without a human in the loop.
  "settings_automation",
  // Environment & data source switch + session security.
  "settings_system",
  // NPS survey configuration: triggers, anti-fatigue windows and the two
  // mass-dispatch backstops.
  "settings_nps",
] as const;

export type ResourceName = (typeof RESOURCES)[number];
