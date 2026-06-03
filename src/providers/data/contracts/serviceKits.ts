import type { ID, IServiceKit } from "@/shared/types";

export interface IListServiceKitsParams {
  storeId?: ID;
}

/**
 * Contract for revision kits (read-only in the MVP).
 *
 * @see ../../../mocks/api/serviceKits.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IServiceKitsProvider {
  list(params?: IListServiceKitsParams): Promise<IServiceKit[]>;
}
