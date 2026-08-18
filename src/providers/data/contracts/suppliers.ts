import type {
  ID,
  ISupplier,
  ISupplierStats,
  SupplierCategory,
  SupplierPaymentMethod,
  SupplierStatus,
} from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSuppliersParams extends IPaginationParams {
  /** Matches name, trade name and document. */
  search?: string;
  category?: SupplierCategory;
  status?: SupplierStatus;
}

export interface ICreateSupplierInput {
  storeId: ID;
  name: string;
  tradeName?: string;
  document?: string;
  category: SupplierCategory;
  paymentTerms?: string;
  leadTimeDays?: number;
  contactName?: string;
  contactPhone?: string;
  preferredPaymentMethod?: SupplierPaymentMethod;
  suppliedItems?: string[];
  registryStatus?: string;
  registryActivity?: string;
  city?: string;
  state?: string;
  notes?: string;
}

export type IUpdateSupplierPatch = Partial<Omit<ICreateSupplierInput, "storeId">> & {
  status?: SupplierStatus;
};

/**
 * Contract for suppliers (ui_kit `financeiro`, fatia 1).
 *
 * `stats` is separate from `get` on purpose: the metrics are DERIVED (today
 * from `parts.suppliers`, tomorrow also from `payable`), cost a full catalog
 * scan, and only the rail and the drawer need them.
 *
 * @see ../../../mocks/api/suppliers.ts
 */
export interface ISuppliersProvider {
  list(params?: IListSuppliersParams): Promise<IPaginatedResult<ISupplier>>;
  get(id: ID): Promise<ISupplier>;
  create(input: ICreateSupplierInput): Promise<ISupplier>;
  update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier>;
  /** Soft removal — flips `status` to `inactive`; history is never deleted. */
  archive(id: ID): Promise<ISupplier>;
  /** Single-supplier stats — the "Ficha completa" drawer's own fetch. */
  stats(id: ID): Promise<ISupplierStats>;
  /**
   * Batched `stats` for a whole visible list. NOT sugar for
   * `Promise.all(ids.map(stats))` — the Supabase impl makes exactly ONE
   * paginated pass over the store's `parts` regardless of `ids.length`,
   * bucketing rows by normalized supplier name and assembling each
   * supplier's stats from its bucket. Callers with more than one supplier
   * on screen (the list's KPI strip / `parts`+`purchases` columns) MUST use
   * this instead of looping `stats()` — see
   * `src/providers/data/impl/supabase/suppliers.ts` for why looping it
   * costs 2 requests and a full catalog scan PER supplier.
   */
  statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>>;
}
