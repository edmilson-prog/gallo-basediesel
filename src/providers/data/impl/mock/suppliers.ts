import type { ID, ISupplier, ISupplierStats, IPendingSupplier } from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Mock de fornecedores (PRD-216 + convergência com a tela de gestão).
 *
 * A Fase 1 nascia com `store` vazio — não havia tela para exibir. Agora há
 * uma, então o mock semeia doze fornecedores espelhando o kit de design
 * (`FIN_FORN`), inline neste módulo (mesmo padrão self-contained de
 * `conversationTags.ts`/`messageTemplates.ts` — evita o import circular que
 * puxar de `@/mocks/data` causaria a partir da camada de providers).
 * `__resetSuppliersMock` repovoa essa semente em vez de esvaziar, para os
 * testes que assumem um estado conhecido em vez de um catálogo vazio.
 */

const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";
const SEED_TS = "2026-08-17T12:00:00.000Z";

function seedSupplier(
  id: string,
  cnpj: string,
  corporateName: string,
  category: string,
  patch: Partial<ISupplier> = {},
): ISupplier {
  return {
    id,
    storeId: SEED_STORE_ID,
    cnpj,
    corporateName,
    category,
    suppliedItems: [],
    active: true,
    createdFromXml: false,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    ...patch,
  };
}

/**
 * Mirrors FIN_FORN from the ui_kit, so the mock screen reads like the
 * design. CNPJs are synthetic but pass the real módulo-11 checksum
 * (`isValidCnpj`), same algorithm as `src/features/customers/utils/cnpjCpf.ts`,
 * since `SupplierFormDialog` validates on edit.
 */
const SEED_SUPPLIERS: ISupplier[] = [
  seedSupplier("sup-dintec", "11444555000149", "DINTEC Distribuidora", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 3,
    contactName: "Camila Reis",
    contactPhone: "5433218800",
    suppliedItems: ["Bicos injetores Bosch", "Bombas rotativas", "Kits de reparo"],
  }),
  seedSupplier("sup-bosch", "22555666000149", "Robert Bosch", "parts", {
    paymentTerms: "30/60/90",
    leadTimeDays: 7,
    contactName: "Canal distribuidor",
    suppliedItems: ["Sistema common rail", "Velas aquecedoras", "Sensores"],
  }),
  seedSupplier("sup-mahle", "33666777000149", "MAHLE Metal Leve", "parts", {
    paymentTerms: "30/60",
    leadTimeDays: 9,
    contactName: "Rogério Alves",
    contactPhone: "1140093300",
    suppliedItems: ["Pistões e camisas", "Filtros de óleo", "Bronzinas"],
  }),
  seedSupplier("sup-fleetguard", "44777888000149", "Fleetguard", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 11,
  }),
  seedSupplier("sup-tecfil", "55888999000149", "Tecfil", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 5,
    contactName: "Ana Petry",
    contactPhone: "1121184400",
    suppliedItems: ["Linha de filtros", "Cabine e ar"],
  }),
  seedSupplier("sup-delphi", "66999000000155", "Delphi Technologies", "parts", {
    paymentTerms: "45 dias",
    leadTimeDays: 14,
  }),
  seedSupplier("sup-retifica", "77000111000122", "Retífica Alto Uruguai", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 4,
    contactName: "Ivo Casaril",
    contactPhone: "5537442200",
    suppliedItems: ["Retífica de cabeçote", "Usinagem de bloco"],
  }),
  seedSupplier("sup-cresol", "88111222000122", "Banco Cresol — antecipação", "financial", {
    paymentTerms: "1,89% a.m.",
    leadTimeDays: 0,
    contactName: "Agência 0812 · gerente Rafael",
    suppliedItems: ["Desconto de duplicata", "Cobrança bancária"],
  }),
  seedSupplier("sup-jamef", "99222333000122", "Jamef Transportes", "freight", {
    paymentTerms: "14 dias",
    leadTimeDays: 2,
    suppliedItems: ["Frete rodoviário", "Coleta programada"],
  }),
  seedSupplier("sup-sabo", "10333444000100", "Sabó Vedações", "parts", {
    paymentTerms: "30 dias",
    leadTimeDays: 8,
  }),
  seedSupplier("sup-zen", "20444555000130", "ZEN S/A", "parts", {
    paymentTerms: "30/60",
    leadTimeDays: 10,
  }),
  seedSupplier("sup-ferramentaria", "30555666000177", "Ferramentaria Seberi", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 2,
  }),
];

/** Small, fixed backlog so the pending-registration queue has something to
 *  render in mock mode — the mock has no `parts` catalog scan to derive it
 *  from for real. None of these names match a seeded supplier above. */
const SEED_PENDING: IPendingSupplier[] = [
  { key: "wega", displayName: "Wega", partCount: 14 },
  { key: "fras le", displayName: "Fras-le", partCount: 6 },
  { key: "randon pecas", displayName: "Randon Peças", partCount: 3 },
];

/** Zeroed `ISupplierStats` — the mock has no purchase-entry history, and
 *  inventing numbers is exactly what this slice exists to avoid. */
function zeroStats(supplierId: ID): ISupplierStats {
  return {
    supplierId,
    linkedParts: 0,
    purchasesLast12Months: 0,
    lastEntries: [],
    monthlyPurchases: Array.from({ length: 12 }, () => 0),
  };
}

let store: ISupplier[] = structuredClone(SEED_SUPPLIERS);

/** Uso exclusivo de teste. */
export function __resetSuppliersMock(): void {
  store = structuredClone(SEED_SUPPLIERS);
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
    const current = store.find((s) => s.id === id);
    if (!current) throw new Error(`[mock] suppliers.update(${id}): fornecedor não encontrado`);
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safe } = patch;
    const updated: ISupplier = { ...current, ...safe, updatedAt: new Date().toISOString() };
    store = store.map((s) => (s.id === id ? updated : s));
    return updated;
  },

  async archive(id: ID): Promise<ISupplier> {
    return mockSuppliersProvider.update(id, { active: false });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    const found = store.find((s) => s.id === id);
    if (!found) throw new Error(`[mock] suppliers.stats(${id}): fornecedor não encontrado`);
    return zeroStats(id);
  },

  async statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>> {
    const known = new Set(store.map((s) => s.id));
    const result = new Map<ID, ISupplierStats>();
    for (const id of ids) {
      if (!known.has(id)) continue;
      result.set(id, zeroStats(id));
    }
    return result;
  },

  async pendingFromCatalog(_storeId: ID): Promise<IPendingSupplier[]> {
    return [...SEED_PENDING];
  },
};
