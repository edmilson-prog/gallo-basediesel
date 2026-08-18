import type {
  ID,
  IVehicleModelKit,
  IKitItem,
  ModelKitCategory,
  ModelKitStatus,
} from "@/shared/types";

export interface IListModelKitsParams {
  modelId?: ID;
  status?: ModelKitStatus;
  category?: ModelKitCategory;
  search?: string;
}

export interface ICreateModelKitInput {
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status?: ModelKitStatus;
  items: IKitItem[];
}

export interface IUpdateModelKitPatch {
  name?: string;
  category?: ModelKitCategory;
  status?: ModelKitStatus;
  items?: IKitItem[];
}

/**
 * Contract for model kits (PRD-035). `list` is read by the model-detail section
 * and the quote editor; writes back the editor + curation actions.
 *
 * @see ../../../mocks/api/modelKits.ts
 */
export interface IModelKitsProvider {
  list(params?: IListModelKitsParams): Promise<IVehicleModelKit[]>;
  get(id: ID): Promise<IVehicleModelKit>;
  /**
   * How many quotes applied each of the given kits, aggregated from
   * `IQuote.appliedKitIds` (written by the quote editor at save time). Kits with
   * no application are omitted from the result. Scoped by what the caller can
   * read — a seller restricted to their own quotes sees their own count.
   */
  applicationCounts(kitIds: ID[]): Promise<Record<ID, number>>;
  create(input: ICreateModelKitInput): Promise<IVehicleModelKit>;
  update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit>;
  delete(id: ID): Promise<void>;
}
