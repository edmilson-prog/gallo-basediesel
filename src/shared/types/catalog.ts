import type { Division, ID, ISO8601, Money } from "./common";
import type { PartCategory } from "./part-identification";

/**
 * Vehicle application of a part — combination of vehicle attributes the part fits.
 * Year range is inclusive on both ends.
 *
 * @see ../../../docs/glossario.md#aplicacao
 */
export interface IApplication {
  id: ID;
  vehicleBrand: string;
  vehicleModel: string;
  yearStart: number;
  yearEnd: number;
  engine?: string;
}

/** Validation state of a part's GTIN against the SEFAZ registry. */
export type SefazStatus = "validated" | "not_checked" | "invalid";

/**
 * Named price table — final price is derived from the part's base cost by a
 * markup. Mirrors the DINTEC "Cadastro de Valores do Produto".
 */
export interface IPriceTable {
  /** Stable channel id (`padrao` | `ecommerce` | `oficina` | `varejo` | `atacado`). */
  id: string;
  label: string;
  /** Markup as a decimal over cost (1.20 = +120%). */
  markupPercent: number;
  /** Final price = unitCost * (1 + markupPercent). */
  price: Money;
}

/** A supplier stock-entry for a part (DINTEC "Entrada no Estoque" row). */
export interface IPartSupplier {
  id: ID;
  name: string;
  /** Supplier's internal code for this part. */
  supplierCode?: string;
  /** Inbound invoice (nota fiscal) number. */
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
}

/**
 * Aftermarket cross-reference — the same part as catalogued by a competitor
 * brand. Distinct from `equivalentPartIds` (which links other GALLO parts) and
 * from `oemCodes` (the vehicle manufacturer's original number).
 */
export interface IPartCrossReference {
  /** Competitor brand (e.g. "Mann", "Fleetguard"). */
  brand: string;
  /** That brand's part number for this item. */
  code: string;
}

/** Tax attributes surfaced on the detail page. */
export interface IPartFiscal {
  /** Mercosul tax classification code (e.g. "8421.23.00"). */
  ncm?: string;
  /** ICMS rate in percent (e.g. 17). */
  icmsPercent?: number;
  /** Whether tax substitution (ST) applies. */
  taxSubstitution?: boolean;
  /** Goods origin label (e.g. "Nacional"). */
  origin?: string;
}

/**
 * Part — the commercial unit sold by GALLO BASE DIESEL.
 *
 * @see ../../../docs/glossario.md#oem
 * @see ../../../docs/glossario.md#sku
 */
export interface IPart {
  id: ID;
  /** Internal GALLO catalog identifier. */
  sku: string;
  name: string;
  description?: string;
  /** OEM codes attributed by the original equipment manufacturer(s). */
  oemCodes: string[];
  /** Other parts considered functionally equivalent (alternative sale). */
  equivalentPartIds: ID[];
  /** Competitor brand cross-references (aftermarket equivalents). */
  crossReferences?: IPartCrossReference[];
  applications: IApplication[];
  brand: string;
  supplier: string;
  /** Canonical part family — PRD-030. Mirrors the taxonomy used by PRD-021. */
  category?: PartCategory;
  /** Sub-category within the family (e.g. `oleo` for `filtro`). */
  subcategory?: string;
  /** True when this part is the OEM original (Volvo Genuine, Scania Original…). */
  isOriginal?: boolean;
  /** Optional artwork. MVP falls back to a category icon when absent. */
  imageUrl?: string;
  unitCost: Money;
  unitPrice: Money;
  /** Margin as decimal (0.30 = 30%). */
  marginPercent: number;
  // --- DINTEC enrichment (PRD product-detail redesign) — all optional/additive ---
  /** Global trade item number (EAN-13 barcode), distinct from the supplier code. */
  gtin?: string;
  /** SEFAZ validation state of the GTIN. */
  sefazStatus?: SefazStatus;
  /** When the GTIN was last validated against SEFAZ. */
  sefazCheckedAt?: ISO8601;
  /** Supplier's internal code — historically misused as the barcode in the ERP. */
  supplierCode?: string;
  /** Manufacturer reference number. */
  reference?: string;
  /** ERP product group (e.g. "1-FILTRO"). */
  group?: string;
  /** Free-text product type. */
  partType?: string;
  /** Named price tables (Padrão, Ecommerce, Oficina, Varejo, Atacado). */
  priceTables?: IPriceTable[];
  /** Tax attributes. */
  fiscal?: IPartFiscal;
  /** Net weight in kilograms. */
  weightKg?: number;
  /** Physical warehouse location (e.g. "A-12"). */
  storageLocation?: string;
  /** Units per box. */
  boxQuantity?: number;
  /** Whether the part can be sold fractionally. */
  fractionable?: boolean;
  /** Unit of measure (e.g. "UN", "PC", "L"). */
  unitOfMeasure?: string;
  /** Supplier stock-entry history. */
  suppliers?: IPartSupplier[];
  /** Weighted average cost (C.M.) across supplier entries. */
  averageCost?: Money;
  stockAvailable: number;
  stockMinimum: number;
  /** Division this part belongs to. On the MVP always `'parts'`. */
  division: Division;
  active: boolean;
  /** Multi-store (PRD-007). Optional on legacy mock data. */
  storeId?: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
