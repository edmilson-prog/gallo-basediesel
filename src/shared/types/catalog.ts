import type { Division, ID, ISO8601, Money } from "./common";

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
  unitCost: Money;
  unitPrice: Money;
  /** Margin as decimal (0.30 = 30%). */
  marginPercent: number;
  stockAvailable: number;
  stockMinimum: number;
  /** Division this part belongs to. On the MVP always `'parts'`. */
  division: Division;
  active: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
