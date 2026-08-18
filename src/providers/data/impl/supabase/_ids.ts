// src/providers/data/impl/supabase/_ids.ts

/** Canonical form of a Postgres `uuid` literal (any version, any case). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a literal Postgres accepts in a `uuid` column.
 *
 * The domain models ids as free-form strings ({@link import("@/shared/types").ID}),
 * and the mock layer mints readable prefixed ones ("qi-…", "oi-…"). Those are
 * fine in memory and rejected by the database, so anything heading for a `uuid`
 * column is checked here first.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
