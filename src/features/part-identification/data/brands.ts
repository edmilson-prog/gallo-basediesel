/**
 * Vehicle brands the keyword extractor recognises. Each entry pairs the
 * canonical brand name (used everywhere downstream — including
 * `IVehicle.brand` and `IApplication.vehicleBrand`) with the aliases a
 * customer might actually type on WhatsApp.
 *
 * Aliases are always normalised to lower-case at match time, so registering
 * them in lower-case avoids surprises.
 *
 * @see ../../../../shared/types/part-identification.ts
 */
export interface IBrandEntry {
  /** Canonical name preserved in `IExtractedAttributes.brand`. */
  canonical: string;
  /** Lower-case aliases — first one is the most common writing. */
  aliases: string[];
}

export const BRANDS: IBrandEntry[] = [
  {
    canonical: "Volvo",
    aliases: ["volvo"],
  },
  {
    canonical: "Scania",
    aliases: ["scania", "scnia"],
  },
  {
    canonical: "Mercedes-Benz",
    aliases: ["mercedes", "mercedes-benz", "mercedes benz", "mb", "mbb"],
  },
  {
    canonical: "Ford Cargo",
    aliases: ["ford cargo", "cargo", "ford"],
  },
  {
    canonical: "Iveco",
    aliases: ["iveco"],
  },
];

/** Flat list of every alias indexed by canonical brand — kept for tests/inspector. */
export const BRAND_ALIASES_FLAT: Array<{ alias: string; canonical: string }> = BRANDS.flatMap((b) =>
  b.aliases.map((alias) => ({ alias, canonical: b.canonical })),
);
