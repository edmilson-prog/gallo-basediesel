import type { ID, ISupplier } from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Mock de fornecedores (PRD-216). Estado em memória — a Fase 1 não popula
 * nada pelo gerador de seeds, porque não há tela para exibir. Existe para
 * o parser e a importação da Fase 2 terem contra o que rodar.
 */

let store: ISupplier[] = [];

/** Uso exclusivo de teste. */
export function __resetSuppliersMock(): void {
  store = [];
}

export const mockSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    let rows = [...store];
    if (params.storeId) rows = rows.filter((s) => s.storeId === params.storeId);
    if (params.active !== undefined) rows = rows.filter((s) => s.active === params.active);
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.corporateName.toLowerCase().includes(needle) ||
          (s.tradeName ?? "").toLowerCase().includes(needle) ||
          s.cnpj.includes(needle.replace(/\D/g, "")),
      );
    }
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ISupplier> {
    const found = store.find((s) => s.id === id);
    if (!found) throw new Error(`[mock] suppliers.get(${id}): fornecedor não encontrado`);
    return found;
  },

  async findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null> {
    const digits = cnpj.replace(/\D/g, "");
    return store.find((s) => s.cnpj === digits && s.storeId === storeId) ?? null;
  },

  async create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier> {
    const digits = input.cnpj.replace(/\D/g, "");
    if (store.some((s) => s.cnpj === digits && s.storeId === input.storeId)) {
      throw new Error(`[mock] suppliers.create: CNPJ ${digits} já cadastrado nesta loja`);
    }
    const now = new Date().toISOString();
    const supplier: ISupplier = {
      ...input,
      cnpj: digits,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    store.push(supplier);
    return supplier;
  },

  async update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier> {
    const index = store.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`[mock] suppliers.update(${id}): fornecedor não encontrado`);
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safe } = patch;
    store[index] = { ...store[index], ...safe, updatedAt: new Date().toISOString() };
    return store[index];
  },
};
