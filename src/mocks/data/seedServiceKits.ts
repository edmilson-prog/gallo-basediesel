import type { IServiceKit } from "@/shared/types";

// Mirroring SEED_STORE_ID from seedStore.ts inline to avoid the ESM circular
// dependency that arises when scripts/tests import this module outside the Vite
// bundler (seedStore → @/features/sdr-quote → @/mocks → bootstrap → ../data →
// seedSellers → seedStore — TDZ error in Bun's static-import evaluation order).
const STORE_ID = "store-matriz";

/**
 * Static, read-only revision kits for the MVP demo. partIds reference catalog
 * parts; unresolved ids are ignored gracefully at insert time (see
 * src/features/quotes/utils/kitExpansion.ts).
 */
export const SEED_SERVICE_KITS: IServiceKit[] = [
  {
    id: "kit-revisao-volvo-fh-40k",
    storeId: STORE_ID,
    name: "Revisão 40.000 km — Volvo FH",
    description: "Filtros e óleo para revisão programada.",
    vehicleApplication: { brand: "Volvo", model: "FH" },
    category: "filtro",
    items: [
      { partId: "part-ufi-23-127-00", quantity: 1 },
      { partId: "part-ufi-24-159-00", quantity: 1 },
      { partId: "part-ufi-20-016-00", quantity: 2 },
    ],
  },
  {
    id: "kit-revisao-scania-r-filtros",
    storeId: STORE_ID,
    name: "Kit de filtros — Scania R",
    description: "Conjunto de filtros para troca preventiva.",
    vehicleApplication: { brand: "Scania", model: "R" },
    category: "filtro",
    items: [
      { partId: "part-ufi-23-290-00", quantity: 1 },
      { partId: "part-ufi-24-258-00", quantity: 1 },
    ],
  },
  {
    id: "kit-consumiveis-gerais",
    storeId: STORE_ID,
    name: "Consumíveis gerais",
    description: "Itens de giro rápido para qualquer frota.",
    items: [
      { partId: "part-ufi-23-120-01", quantity: 4 },
      { partId: "part-ufi-23-127-00", quantity: 2 },
    ],
  },
];
