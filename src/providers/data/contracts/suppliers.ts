import type { ID, ISupplier, ISupplierStats, IPendingSupplier } from "@/shared/types";
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
 * `archive`, `stats`, `statsMany` e `pendingFromCatalog` são a extensão da
 * convergência com a tela de gestão (ui_kit financeiro) — não tocam o
 * caminho de importação de NF-e.
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
  /** Desativa sem apagar: escreve `active = false`. Histórico nunca some. */
  archive(id: ID): Promise<ISupplier>;
  /** Métricas derivadas de um fornecedor. Custa um scan do catálogo. */
  stats(id: ID): Promise<ISupplierStats>;
  /** O mesmo para vários, numa passada só sobre `parts`. */
  statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>>;
  /** Nomes de `parts.supplier` que ainda não têm cadastro. */
  pendingFromCatalog(storeId: ID): Promise<IPendingSupplier[]>;
}
