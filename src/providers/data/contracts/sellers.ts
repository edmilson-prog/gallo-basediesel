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
  /**
   * Patch arbitrary seller fields (PRD-019 — user editing their own profile).
   *
   * The mock layer enforces no scope check; callers (the profile page) are
   * expected to limit the patch to the currently signed-in user.
   */
  update(id: ID, patch: Partial<ISeller>): Promise<ISeller>;
}
