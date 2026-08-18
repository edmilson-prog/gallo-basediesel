import type { ID, ISupplier } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSuppliersParams extends IPaginationParams {
  search?: string;
  active?: boolean;
  storeId?: ID;
}

/**
 * Contract de acesso a fornecedores (PRD-216).
 *
 * `findByCnpj` é a operação central da importação: é ela que decide entre
 * vincular a nota a um cadastro existente ou criar um do bloco `<emit>`.
 *
 * @see ../impl/mock/suppliers.ts
 * @see ../../../../docs/prds/PRD-216-notas-fiscais-entrada.md
 */
export interface ISuppliersProvider {
  list(params?: IListSuppliersParams): Promise<IPaginatedResult<ISupplier>>;
  get(id: ID): Promise<ISupplier>;
  /** `cnpj` só dígitos. `null` quando não há cadastro — o chamador cria. */
  findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null>;
  create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier>;
  update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier>;
}
