import type { ID, IPart, IPartCrossReference, PartCategory } from "@/shared/types";
import { applicationsToDrafts, type IApplicationDraft } from "../components/form/ApplicationsEditor";
import { resolvePriceTables } from "./pricing";

export interface INewSupplierEntryDraft {
  name: string;
  supplierCode: string;
  invoiceNumber: string;
  invoiceDate: string;
  cost: number | undefined;
  quantity: number | undefined;
}

export interface IPartDraft {
  name: string;
  description: string;
  oemPrimary: string;
  oemAlternatives: string;
  brand: string;
  supplier: string;
  isOriginal: boolean;
  category: PartCategory | undefined;
  subcategory: string | undefined;
  gtin: string;
  reference: string;
  group: string;
  partType: string;

  unitCost: number;
  priceTables: ReturnType<typeof resolvePriceTables>;

  fiscal: {
    ncm: string;
    icmsPercent: number | undefined;
    taxSubstitution: boolean;
    origin: string;
  };

  weightKg: number | undefined;
  storageLocation: string;
  boxQuantity: number | undefined;
  fractionable: boolean;
  unitOfMeasure: string;

  stockAvailable: number;
  stockMinimum: number;

  applications: IApplicationDraft[];
  equivalentPartIds: ID[];
  crossReferences: IPartCrossReference[];

  newSupplierEntry: INewSupplierEntryDraft | null;
}

/** Same parsing the old `PartEditPage` used: primary code + comma-separated alternatives. */
export function parseOemCodes(primary: string, alternatives: string): string[] {
  const alts = alternatives
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary.trim(), ...alts].filter(Boolean);
}

export function toPartDraft(part: IPart): IPartDraft {
  return {
    name: part.name,
    description: part.description ?? "",
    oemPrimary: part.oemCodes[0] ?? "",
    oemAlternatives: part.oemCodes.slice(1).join(", "),
    brand: part.brand,
    supplier: part.supplier,
    isOriginal: part.isOriginal ?? false,
    category: part.category,
    subcategory: part.subcategory,
    gtin: part.gtin ?? "",
    reference: part.reference ?? "",
    group: part.group ?? "",
    partType: part.partType ?? "",

    unitCost: part.unitCost,
    priceTables: resolvePriceTables(part),

    fiscal: {
      ncm: part.fiscal?.ncm ?? "",
      icmsPercent: part.fiscal?.icmsPercent,
      taxSubstitution: part.fiscal?.taxSubstitution ?? false,
      origin: part.fiscal?.origin ?? "",
    },

    weightKg: part.weightKg,
    storageLocation: part.storageLocation ?? "",
    boxQuantity: part.boxQuantity,
    fractionable: part.fractionable ?? false,
    unitOfMeasure: part.unitOfMeasure ?? "",

    stockAvailable: part.stockAvailable,
    stockMinimum: part.stockMinimum,

    applications: applicationsToDrafts(part.applications),
    equivalentPartIds: part.equivalentPartIds,
    crossReferences: part.crossReferences ?? [],

    newSupplierEntry: null,
  };
}
