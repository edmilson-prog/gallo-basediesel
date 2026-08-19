/**
 * Canonical vehicle brand vocabulary.
 *
 * These are the brands `normalizeVehicleBrandModel` (the DINTEC importer that
 * populated `vehicles`) can write, so they are exactly the values the `brand`
 * column holds today. The provider matches brands exactly
 * (`.in("brand", …)`), which is why "Ford" and "Ford Cargo" are two separate
 * entries rather than one — the importer emits both and they are different
 * buckets in the DB.
 *
 * This list is a FALLBACK, not the source of truth. The live option list is
 * derived from the database by `useVehicleBrandOptions`; this constant keeps
 * the filter usable before that query resolves (and if it fails), and seeds
 * the brand pickers in the vehicle create/edit modals.
 *
 * @see ../hooks/useVehicleBrandOptions
 * @see @/features/dintec-import/engine/vehicleNormalize
 */
export const VEHICLE_BRANDS = [
  "DAF",
  "Fiat",
  "Ford",
  "Ford Cargo",
  "Iveco",
  "MAN",
  "Mercedes-Benz",
  "Nissan",
  "Renault",
  "Scania",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Outra",
] as const;

export type VehicleBrand = (typeof VEHICLE_BRANDS)[number];

/**
 * Catch-all the importer assigns when no prefix rule matches. Pinned to the
 * bottom of every picker so it never sits between real brands.
 */
export const UNKNOWN_VEHICLE_BRAND = "Outra";

function normalizeKey(brand: string): string {
  return brand.trim().toLowerCase();
}

/**
 * Builds the brand option list shown in filters and pickers: the brands
 * actually present in the database, unioned with a static fallback so the
 * list is never empty while the query is in flight.
 *
 * Dedupes case- and whitespace-insensitively, preferring the fallback's
 * canonical spelling over whatever casing a manually typed row happens to
 * carry. Sorted alphabetically with {@link UNKNOWN_VEHICLE_BRAND} last.
 */
export function mergeBrandOptions(
  fromDb: readonly string[] | undefined,
  fallback: readonly string[] = VEHICLE_BRANDS,
): string[] {
  const byKey = new Map<string, string>();
  // Fallback first so its canonical spelling wins over DB casing variants.
  for (const brand of [...fallback, ...(fromDb ?? [])]) {
    const label = brand.trim();
    if (!label) continue;
    const key = normalizeKey(label);
    if (!byKey.has(key)) byKey.set(key, label);
  }

  const catchAllKey = normalizeKey(UNKNOWN_VEHICLE_BRAND);
  const catchAll = byKey.get(catchAllKey);
  byKey.delete(catchAllKey);

  const sorted = [...byKey.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return catchAll ? [...sorted, catchAll] : sorted;
}
