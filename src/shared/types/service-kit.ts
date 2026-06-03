import type { ID } from "./common";
import type { PartCategory } from "./part-identification";

/** One line of a service kit — a part and how many of it the kit includes. */
export interface IServiceKitItem {
  partId: ID;
  quantity: number;
}

/**
 * Service kit (kit de revisão) — a named bundle of parts a seller can insert
 * into a quote in one action (e.g. "Revisão 40.000 km — Volvo FH").
 * Read-only in the MVP; full CRUD is deferred (tracked as a git issue).
 */
export interface IServiceKit {
  id: ID;
  storeId: ID;
  name: string;
  description?: string;
  /** When set, the kit targets a specific vehicle brand/model. */
  vehicleApplication?: { brand: string; model: string };
  /** Optional taxonomy tag for filtering/grouping. */
  category?: PartCategory;
  items: IServiceKitItem[];
}
