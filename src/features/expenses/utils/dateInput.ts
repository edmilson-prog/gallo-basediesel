/**
 * Helpers bridging ISO 8601 timestamps and the `yyyy-MM-dd` value a native
 * `<input type="date">` expects. All dates are treated as UTC midnight to keep
 * competence/payment boundaries stable across timezones.
 */

/** ISO timestamp → `yyyy-MM-dd` (empty string when absent/invalid). */
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** `yyyy-MM-dd` → ISO timestamp at UTC midnight. */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/** Today as `yyyy-MM-dd` (UTC). */
export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First day of a `yyyy-MM-dd` value's month, as ISO. */
export function monthStartIso(value: string): string {
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toISOString();
}
