// src/shared/types/model-kits.ts
import type { ID, ISO8601 } from "./common";

/** Category of a model kit. MVP delivers data for "filtros" only; the union is
 *  forward-compatible with the vehicle-detail recommendation cards (PRD-016). */
export type ModelKitCategory = "filtros" | "freios" | "correia" | "revisao" | "custom";

/** Curation lifecycle: a seller drafts ("rascunho"); a manager promotes to
 *  "oficial". Mirrors the tag-promotion pattern. */
export type ModelKitStatus = "rascunho" | "oficial";

/** One line of a kit — a LIVE reference to a catalog part (never a snapshot).
 *  The snapshot happens on the quote item, at apply time. */
export interface IKitItem {
  partId: ID;
  /** Default quantity injected into the quote (> 0; fuel filters often come in 2). */
  defaultQuantity: number;
  /** false = base part (pre-checked in the apply preview); true = suggestion. */
  isOptional: boolean;
  /** Optional curation note, e.g. "trocar a cada 30.000 km". */
  note?: string;
}

/**
 * Curated bundle of parts hung off a canonical vehicle model (PRD-034). Applied
 * with one click into a quote. The kit is a LIVE definition; quotes snapshot
 * price/OEM at apply time, so kits never need versioning.
 */
export interface IVehicleModelKit {
  id: ID;
  /** Canonical model key (PRD-034). Required — kits hang off models, not strings. */
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status: ModelKitStatus;
  items: IKitItem[];
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
