import type { ID, IPart, IPartCrossReference, PartCategory } from "@/shared/types";
import { applicationsToDrafts, type IApplicationDraft } from "../../../utils/applicationDrafts";
import type { IPartCompletenessInput } from "../../../engine/newPart";

/**
 * Numeric fields are held as strings so an empty box stays empty instead of
 * snapping back to `0` the moment it is cleared.
 */
export interface IPartFormValues {
  /** Primary code (OEM or manufacturer) — the field the form leads with. */
  code: string;
  oemAlternatives: string;
  name: string;
  description: string;
  brand: string;
  supplier: string;
  isOriginal: boolean;
  category: PartCategory | undefined;
  subcategory: string | undefined;
  unitCost: string;
  /** Padrão markup over cost, in percent (`"120"` = 120%). */
  markupPercent: string;
  /** Price typed by hand when there is no cost to price from. */
  directPrice: string;
  stockAvailable: string;
  stockMinimum: string;
  applications: IApplicationDraft[];
  equivalentPartIds: ID[];
  crossReferences: IPartCrossReference[];
}

/** 120% reproduces the ERP's 140/120/100/80/60 ladder. */
export const DEFAULT_MARKUP = "120";

/** Manufacturers seen most often on the counter — a datalist, never a closed list. */
export const KNOWN_BRANDS = [
  "MANN",
  "BOSCH",
  "UFI",
  "ELRING",
  "HENGST",
  "FRAS-LE",
  "GATES",
  "MOBIL",
  "PARKER RACOR",
  "MERCEDES BENZ",
  "ALLIANCE",
  "DONALDSON",
  "FLEETGUARD",
  "CONTITECH",
  "TRW",
];

export function blankPartFormValues(seed?: Partial<IPartFormValues>): IPartFormValues {
  return {
    code: "",
    oemAlternatives: "",
    name: "",
    description: "",
    brand: "",
    supplier: "",
    isOriginal: false,
    category: undefined,
    subcategory: undefined,
    unitCost: "",
    markupPercent: DEFAULT_MARKUP,
    directPrice: "",
    stockAvailable: "0",
    stockMinimum: "4",
    applications: [],
    equivalentPartIds: [],
    crossReferences: [],
    ...seed,
  };
}

/**
 * Seed the form from an existing part ("Duplicar peça"). Stock is deliberately
 * not carried over: the copy is a different part on a different shelf.
 */
export function partFormValuesFrom(part: IPart | undefined): IPartFormValues {
  if (!part) return blankPartFormValues();
  const markup = part.marginPercent > 0 ? String(Math.round(part.marginPercent * 100)) : "";
  return blankPartFormValues({
    code: part.oemCodes[0] ?? "",
    oemAlternatives: part.oemCodes.slice(1).join(", "),
    name: part.name,
    description: part.description ?? "",
    brand: part.brand,
    supplier: part.supplier,
    isOriginal: part.isOriginal ?? false,
    category: part.category,
    subcategory: part.subcategory,
    unitCost: part.unitCost > 0 ? String(part.unitCost) : "",
    markupPercent: markup || DEFAULT_MARKUP,
    directPrice: part.unitCost > 0 ? "" : String(part.unitPrice || ""),
    stockMinimum: String(part.stockMinimum),
    applications: applicationsToDrafts(part.applications),
    equivalentPartIds: part.equivalentPartIds,
    crossReferences: part.crossReferences ?? [],
  });
}

/**
 * Shape the completeness rules read, built from the raw string fields.
 *
 * Half-typed application rows don't count: `draftsToApplications` drops any row
 * missing a brand or a model, so counting them would promise the part a
 * fitment that never reaches the database.
 */
export function toCompleteness(values: IPartFormValues): IPartCompletenessInput {
  return {
    code: values.code,
    name: values.name,
    brand: values.brand,
    category: values.category,
    unitCost: Number(values.unitCost) || 0,
    markupPercent: (Number(values.markupPercent) || 0) / 100,
    directPrice: Number(values.directPrice) || 0,
    applicationCount: values.applications.filter(
      (a) => a.vehicleBrand.trim() && a.vehicleModel.trim(),
    ).length,
  };
}
