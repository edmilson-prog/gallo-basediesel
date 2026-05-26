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
