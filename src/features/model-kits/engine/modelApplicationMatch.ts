/**
 * Matching between a catalog part's application row and a canonical vehicle
 * model (PRD-034).
 *
 * The two sides speak different dialects. `vehicle_models` is curated —
 * `Volvo` / `FH 460`. `parts.applications` is whatever the supplier sheet
 * carried: `fh12460`, `fh13460`, `fh460`, `fh13540 (2013>)`, `r500`,
 * `Agrale  /  Ford`, and long free-text rows listing several trucks at once.
 *
 * Comparing the two as normalized strings — what the code did before — matched
 * nothing at all in production: `fh 460` is never equal to `fh13460`, and not
 * even to `fh460`, because of the space.
 *
 * Two digits between family and power rating are the engine displacement
 * (FH12 / FH13 / FH16). The owner confirmed the displacement does not
 * distinguish the fit for these parts, so the match ignores it.
 */

/** Lowercase, strip diacritics, collapse whitespace. */
function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Brand words worth comparing — drops punctuation and noise like "/". */
function brandTokens(value: string | undefined): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/**
 * True when the two brands name the same maker. Tolerates the canonical brand
 * carrying an extra word (`Ford` × `Ford Cargo`), the hyphen in `Mercedes-Benz`
 * and supplier rows that lump makers together (`Agrale / Ford`).
 */
export function brandMatches(
  applicationBrand: string | undefined,
  canonicalBrand: string | undefined,
): boolean {
  const application = brandTokens(applicationBrand);
  const canonical = brandTokens(canonicalBrand);
  if (application.length === 0 || canonical.length === 0) return false;
  return application.some((token) => canonical.includes(token));
}

/** Escapes a literal for safe embedding in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the supplier designation names the canonical model, ignoring the
 * displacement digits. Anchored on both sides so a one-letter family (Scania
 * `R`) cannot fire inside another word ("super 500"), and so `1719` does not
 * match `17190`.
 */
export function modelDesignationMatches(
  applicationModel: string | undefined,
  canonicalModel: string | undefined,
): boolean {
  const application = normalize(applicationModel);
  const canonical = normalize(canonicalModel);
  if (!application || !canonical) return false;

  const family = /^[a-z]+/.exec(canonical)?.[0] ?? "";
  const rating = /(\d+)[^0-9]*$/.exec(canonical)?.[1] ?? "";
  // Nothing numeric to anchor on — refuse rather than match on the family alone.
  if (!rating) return false;

  const pattern = family
    ? `(^|[^a-z0-9])${escapeRegExp(family)}\\s*\\d{0,2}\\s*${escapeRegExp(rating)}([^0-9]|$)`
    : `(^|[^0-9])${escapeRegExp(rating)}([^0-9]|$)`;

  return new RegExp(pattern).test(application);
}

export interface IApplicationLike {
  vehicleBrand?: string;
  vehicleModel?: string;
}

export interface ICanonicalModelLike {
  brand: string;
  model: string;
}

/** An application row reaches a canonical model when both brand and designation agree. */
export function applicationMatchesModel(
  application: IApplicationLike,
  model: ICanonicalModelLike,
): boolean {
  return (
    brandMatches(application.vehicleBrand, model.brand) &&
    modelDesignationMatches(application.vehicleModel, model.model)
  );
}
