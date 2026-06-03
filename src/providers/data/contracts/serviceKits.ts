import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export interface ICreateServiceKitInput {
  storeId: ID;
  name: string;
  description?: string;
  vehicleApplication?: { brand: string; model: string };
  category?: PartCategory;
  items: IServiceKitItem[];
}

/**
 * Contract for revision kits. `list` is read-only consumed by the quote editor;
 * the write operations back the management screen (issue #24).
 *
 * @see ../../../mocks/api/serviceKits.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IServiceKitsProvider {
  list(params?: IListServiceKitsParams): Promise<IServiceKit[]>;
  create(input: ICreateServiceKitInput): Promise<IServiceKit>;
  update(id: ID, patch: Partial<ICreateServiceKitInput>): Promise<IServiceKit>;
  remove(id: ID): Promise<void>;
  duplicate(id: ID): Promise<IServiceKit>;
}
