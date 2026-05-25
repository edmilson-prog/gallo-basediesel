import type { ID, ISeller } from "@/shared/types";

export interface IListSellersParams {
  storeId?: ID;
  active?: boolean;
}

/**
 * Contract for seller (vendedor) access.
 *
 * @see ../../../mocks/api/sellers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISellersProvider {
  list(params?: IListSellersParams): Promise<ISeller[]>;
  get(id: ID): Promise<ISeller>;
  setAvailability(id: ID, availability: ISeller["availability"]): Promise<ISeller>;
}
