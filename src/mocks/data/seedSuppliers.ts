import type { ISupplier } from "@/shared/types";

// Mirroring SEED_STORE_ID inline to avoid the ESM circular dependency that arises
// when scripts import this module outside the Vite bundler (see seedServiceKits.ts).
const STORE = "00000000-0000-0000-0000-000000000001";
const NOW = "2026-08-17T12:00:00.000Z";

function seed(
  id: string,
  name: string,
  category: ISupplier["category"],
  patch: Partial<ISupplier> = {},
): ISupplier {
  return {
    id,
    storeId: STORE,
    name,
    category,
    suppliedItems: [],
    status: "active",
    source: "catalog_backfill",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

/** Mirrors FIN_FORN from the ui_kit, so the mock screen reads like the design. */
export const SEED_SUPPLIERS: ISupplier[] = [
  seed("sup-dintec", "DINTEC Distribuidora", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 3,
    contactName: "Camila Reis",
    contactPhone: "5433218800",
    suppliedItems: ["Bicos injetores Bosch", "Bombas rotativas", "Kits de reparo"],
    document: "11222333000181",
    source: "manual",
  }),
  seed("sup-bosch", "Robert Bosch", "parts", {
    paymentTerms: "30/60/90",
    leadTimeDays: 7,
    contactName: "Canal distribuidor",
    suppliedItems: ["Sistema common rail", "Velas aquecedoras", "Sensores"],
  }),
  seed("sup-mahle", "MAHLE Metal Leve", "parts", {
    paymentTerms: "30/60",
    leadTimeDays: 9,
    contactName: "Rogério Alves",
    contactPhone: "1140093300",
    suppliedItems: ["Pistões e camisas", "Filtros de óleo", "Bronzinas"],
  }),
  seed("sup-fleetguard", "Fleetguard", "parts", { paymentTerms: "28 dias", leadTimeDays: 11 }),
  seed("sup-tecfil", "Tecfil", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 5,
    contactName: "Ana Petry",
    contactPhone: "1121184400",
    suppliedItems: ["Linha de filtros", "Cabine e ar"],
  }),
  seed("sup-delphi", "Delphi Technologies", "parts", { paymentTerms: "45 dias", leadTimeDays: 14 }),
  seed("sup-retifica", "Retífica Alto Uruguai", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 4,
    contactName: "Ivo Casaril",
    contactPhone: "5537442200",
    suppliedItems: ["Retífica de cabeçote", "Usinagem de bloco"],
  }),
  seed("sup-cresol", "Banco Cresol — antecipação", "financial", {
    paymentTerms: "1,89% a.m.",
    leadTimeDays: 0,
    contactName: "Agência 0812 · gerente Rafael",
    suppliedItems: ["Desconto de duplicata", "Cobrança bancária"],
  }),
  seed("sup-jamef", "Jamef Transportes", "freight", {
    paymentTerms: "14 dias",
    leadTimeDays: 2,
    suppliedItems: ["Frete rodoviário", "Coleta programada"],
  }),
  seed("sup-sabo", "Sabó Vedações", "parts", { paymentTerms: "30 dias", leadTimeDays: 8 }),
  seed("sup-zen", "ZEN S/A", "parts", { paymentTerms: "30/60", leadTimeDays: 10 }),
  seed("sup-ferramentaria", "Ferramentaria Seberi", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 2,
  }),
];
