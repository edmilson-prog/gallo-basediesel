/**
 * Common utility types shared across the entire GALLO BASE DIESEL domain model.
 *
 * Conventions:
 * - IDs are plain strings; branded types are deferred to a future iteration.
 * - Dates/timestamps are ISO 8601 strings (e.g. "2026-05-25T14:30:00.000Z").
 *   Avoid `Date` to keep serialization stable across mocks, JSON and Supabase.
 * - Monetary values are plain decimal numbers (R$ 1234.56 → 1234.56).
 *
 * @see ../../../docs/glossario.md
 */

/** Unique identifier of any entity. */
export type ID = string;

/** ISO 8601 date/time string (e.g. "2026-05-25T14:30:00.000Z"). */
export type ISO8601 = string;

/** Monetary value as decimal number (R$ 1234.56 → 1234.56). */
export type Money = number;

/**
 * Sub-brand / division of the GALLO umbrella.
 * On the MVP only `parts` is active; `service` and `industrial` are modelled
 * but dormant.
 */
export type Division = "parts" | "service" | "industrial";

/** Visual theme name (matches `data-theme` on `<html>`). */
export type ThemeName = "diesel" | "parts" | "service" | "industrial";

/** Theme color mode (matches `data-mode` on `<html>`; `auto` follows OS). */
export type ThemeMode = "light" | "dark" | "auto";

/**
 * Generic paginated result returned by every `list` op across the data layer.
 * Mirrors the shape the mock paginate util and the future Supabase response
 * both normalize into.
 */
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
