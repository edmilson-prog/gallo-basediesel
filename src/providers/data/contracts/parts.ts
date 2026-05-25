import type { ID, IPart } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListPartsParams extends IPaginationParams {
  search?: string;
  /** Filter by OEM code substring. */
  oem?: string;
  brand?: string;
  active?: boolean;
  inStock?: boolean;
  orderBy?: "name" | "stockAvailable" | "unitPrice";
  orderDir?: "asc" | "desc";
}

/**
 * Contract for parts catalog access (peças pesadas).
 *
 * @see ../../../mocks/api/parts.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IPartsProvider {
  list(params?: IListPartsParams): Promise<IPaginatedResult<IPart>>;
  get(id: ID): Promise<IPart>;
  findByOem(code: string): Promise<IPart[]>;
  listEquivalents(id: ID): Promise<IPart[]>;
  create(input: Omit<IPart, "id" | "createdAt" | "updatedAt">): Promise<IPart>;
  update(id: ID, patch: Partial<IPart>): Promise<IPart>;
  delete(id: ID): Promise<void>;
}
