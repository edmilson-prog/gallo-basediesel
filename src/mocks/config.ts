/**
 * GALLO BASE DIESEL — Mock layer configuration (PRD-004).
 *
 * Centralized knobs for the mock data factory: seed, dataset volumes, simulated
 * latency window and error injection rate. Tweaking these values changes the
 * runtime behavior of every API in `src/mocks/api/` without touching code.
 *
 * The contract here is intentionally narrow: only primitives and one record of
 * volumes. Anything richer (per-entity status distribution, weighted picks)
 * lives next to the generator that consumes it.
 */

/** Logical names of every entity we generate. Keys of {@link VOLUMES}. */
export type MockEntityName =
  | "stores"
  | "sellers"
  | "roles"
  | "audits"
  | "customersB2B"
  | "customersB2C"
  | "customerNotes"
  | "vehicles"
  | "vehicleServiceEntries"
  | "leads"
  | "segments"
  | "transfers"
  | "recommendations"
  | "conversations"
  | "messages"
  | "whatsappAccounts"
  | "parts"
  | "applications"
  | "quotes"
  | "orders"
  | "orderItems"
  | "commissions"
  | "goals"
  | "badges"
  | "rankings"
  | "positivations"
  | "abcClassifications"
  | "mediaAssets"
  | "assetLibraryItems"
  | "quickReplies"
  | "trackableLinks"
  | "assetCombos"
  | "scheduledSends";

/** Default seed for deterministic dataset generation. Changing this regenerates everything. */
export const DEFAULT_SEED = 42;

/**
 * Store-level monthly revenue goal (R$). Single source of truth shared by the
 * goal generator (the active "Faturamento" target) and the order timeline
 * generator (which sizes daily volume so realized revenue tracks this target).
 */
export const STORE_MONTHLY_REVENUE_TARGET = 1_200_000;

/**
 * Target volumes per entity. Bootstrap honors these with a ±10% tolerance to
 * preserve statistical realism (RF-013). Distributions of status/category are
 * encoded inline at each generator.
 */
export const VOLUMES: Record<MockEntityName, number> = {
  stores: 1,
  sellers: 4,
  roles: 7,
  audits: 40,
  customersB2B: 50,
  customersB2C: 20,
  customerNotes: 120,
  vehicles: 60,
  vehicleServiceEntries: 80,
  leads: 80,
  segments: 6,
  transfers: 8,
  recommendations: 25,
  conversations: 80,
  messages: 600,
  whatsappAccounts: 2,
  parts: 200,
  applications: 600,
  quotes: 80,
  orders: 120,
  orderItems: 400,
  commissions: 40,
  goals: 8,
  badges: 20,
  rankings: 1,
  positivations: 1,
  abcClassifications: 70,
  mediaAssets: 90,
  assetLibraryItems: 30,
  quickReplies: 20,
  trackableLinks: 10,
  assetCombos: 5,
  scheduledSends: 0,
};

/** Minimum simulated latency (ms) per API call. */
export const LATENCY_MIN_MS = 80;

/** Maximum simulated latency (ms) per API call. */
export const LATENCY_MAX_MS = 180;

/**
 * Probability (0..1) that any given API call rejects with a `MockNetworkError`.
 * Zero in demo/preview builds; small in dev so loading & error states are
 * naturally exercised.
 */
export const ERROR_RATE = import.meta.env.DEV ? 0.005 : 0;

/** When true, each API call prints a compact line to the console. */
export const MOCK_LOGS_ENABLED = import.meta.env.DEV;

/** localStorage key holding the last seed actively used (debug aid; never required). */
export const LOCALSTORAGE_SEED_KEY = "gallo-mock-seed";
