import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import type {
  ICreateSupplierInput,
  IListSuppliersParams,
  IUpdateSupplierPatch,
} from "@/providers/data/contracts/suppliers";
import { SEED_SUPPLIERS } from "../data/seedSuppliers";
import { paginate } from "./utils/paginate";

/**
 * In-memory supplier store (Fase 1 mock semantics): writes persist for the
 * session and reset on reload. `stats` returns zeros — the mock has no part
 * entry history, and inventing purchases would make the screen lie.
 */

let suppliers: ISupplier[] = SEED_SUPPLIERS.map((s) => ({
  ...s,
  suppliedItems: [...s.suppliedItems],
}));
let createdSeq = 0;

const NOW = () => new Date().toISOString();

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export const suppliersApi = {
  async list(params: IListSuppliersParams = {}) {
    let rows = suppliers;
    if (params.category) rows = rows.filter((s) => s.category === params.category);
    if (params.status) rows = rows.filter((s) => s.status === params.status);
    if (params.search) {
      const needle = fold(params.search);
      rows = rows.filter(
        (s) =>
          fold(s.name).includes(needle) ||
          fold(s.tradeName ?? "").includes(needle) ||
          (s.document ?? "").includes(needle.replace(/\D/g, "")),
      );
    }
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    // paginate(items, params) — the second argument is an object, not positional.
    return paginate(sorted, { page: params.page, pageSize: params.pageSize });
  },

  async get(id: ID): Promise<ISupplier> {
    const found = suppliers.find((s) => s.id === id);
    if (!found) throw new Error(`Fornecedor ${id} não encontrado.`);
    return { ...found };
  },

  async create(input: ICreateSupplierInput): Promise<ISupplier> {
    if (input.document) {
      const clash = suppliers.find(
        (s) => s.storeId === input.storeId && s.document === input.document,
      );
      if (clash) throw new Error(`CNPJ já cadastrado para ${clash.name}.`);
    }
    createdSeq += 1;
    const now = NOW();
    const created: ISupplier = {
      id: `sup-new-${createdSeq}`,
      storeId: input.storeId,
      name: input.name,
      tradeName: input.tradeName,
      document: input.document,
      category: input.category,
      paymentTerms: input.paymentTerms,
      leadTimeDays: input.leadTimeDays,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      preferredPaymentMethod: input.preferredPaymentMethod,
      suppliedItems: input.suppliedItems ?? [],
      status: "active",
      registryStatus: input.registryStatus,
      registryActivity: input.registryActivity,
      city: input.city,
      state: input.state,
      source: "manual",
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    suppliers = [...suppliers, created];
    return { ...created };
  },

  async update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier> {
    const index = suppliers.findIndex((s) => s.id === id);
    if (index < 0) throw new Error(`Fornecedor ${id} não encontrado.`);
    const updated: ISupplier = { ...suppliers[index], ...patch, updatedAt: NOW() };
    suppliers = suppliers.map((s, i) => (i === index ? updated : s));
    return { ...updated };
  },

  async archive(id: ID): Promise<ISupplier> {
    return suppliersApi.update(id, { status: "inactive" });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    // The mock catalog carries no entry history; zeros are the honest answer.
    return {
      supplierId: id,
      linkedParts: 0,
      purchasesLast12Months: 0,
      lastEntries: [],
      monthlyPurchases: Array.from({ length: 12 }, () => 0),
    };
  },

  /** Same zeros as `stats`, batched — the mock has no history to bucket. */
  async statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>> {
    return new Map(
      ids.map((id) => [
        id,
        {
          supplierId: id,
          linkedParts: 0,
          purchasesLast12Months: 0,
          lastEntries: [],
          monthlyPurchases: Array.from({ length: 12 }, () => 0),
        },
      ]),
    );
  },

  /** Test-only: restores the seeded set. */
  __resetForTests() {
    suppliers = SEED_SUPPLIERS.map((s) => ({ ...s, suppliedItems: [...s.suppliedItems] }));
    createdSeq = 0;
  },
};
