/**
 * Configuration constants for the multi-store layer (PRD-007).
 */

/** localStorage key that persists the active store id across sessions. */
export const CURRENT_STORE_LOCALSTORAGE_KEY = "gallo-current-store-id";

/**
 * Sentinel store id used by `withStoreScope()` when no user is authenticated,
 * forcing list queries to return an empty result rather than leaking data.
 */
export const NO_USER_STORE_ID = "__no_user__";
