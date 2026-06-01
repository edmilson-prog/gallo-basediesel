import type { IApplication, IPart, IPartSupplier } from "@/shared/types";
import { buildPriceTables, weightedAverageCost } from "@/features/catalog/utils/pricing";

const PART_ID = "part-ufi-23-290-00";

/**
 * Vehicle applications parsed from the source sheet's free-text "APLICAÇÃO"
 * cell (Scania série 3/4 + Agrale + Case). Open-ended ranges ("1975- >") are
 * capped at 2025.
 */
const APPLICATIONS: IApplication[] = [
  { id: `app-${PART_ID}-0`, vehicleBrand: "Scania", vehicleModel: "B115", yearStart: 1975, yearEnd: 2025 },
  { id: `app-${PART_ID}-1`, vehicleBrand: "Scania", vehicleModel: "B BR111", yearStart: 1975, yearEnd: 2025 },
  { id: `app-${PART_ID}-2`, vehicleBrand: "Scania", vehicleModel: "B BR116", yearStart: 1975, yearEnd: 2025 },
  { id: `app-${PART_ID}-3`, vehicleBrand: "Scania", vehicleModel: "F112", yearStart: 1975, yearEnd: 2025 },
  { id: `app-${PART_ID}-4`, vehicleBrand: "Scania", vehicleModel: "F112HL", yearStart: 1975, yearEnd: 2025 },
  { id: `app-${PART_ID}-5`, vehicleBrand: "Scania", vehicleModel: "F94", yearStart: 1998, yearEnd: 2025 },
  { id: `app-${PART_ID}-6`, vehicleBrand: "Scania", vehicleModel: "K112", yearStart: 1986, yearEnd: 2025 },
  { id: `app-${PART_ID}-7`, vehicleBrand: "Scania", vehicleModel: "K113 CL", yearStart: 1988, yearEnd: 1996 },
  { id: `app-${PART_ID}-8`, vehicleBrand: "Scania", vehicleModel: "K113", yearStart: 1997, yearEnd: 2025 },
  { id: `app-${PART_ID}-9`, vehicleBrand: "Scania", vehicleModel: "L111", yearStart: 1977, yearEnd: 2025 },
  { id: `app-${PART_ID}-10`, vehicleBrand: "Scania", vehicleModel: "P114", yearStart: 1998, yearEnd: 2006 },
  { id: `app-${PART_ID}-11`, vehicleBrand: "Scania", vehicleModel: "P93H/HS", yearStart: 1995, yearEnd: 2025 },
  { id: `app-${PART_ID}-12`, vehicleBrand: "Scania", vehicleModel: "R112 EW", yearStart: 1986, yearEnd: 2025 },
  { id: `app-${PART_ID}-13`, vehicleBrand: "Scania", vehicleModel: "R113 H", yearStart: 1991, yearEnd: 2025 },
  { id: `app-${PART_ID}-14`, vehicleBrand: "Scania", vehicleModel: "R114", yearStart: 1998, yearEnd: 2006 },
  { id: `app-${PART_ID}-15`, vehicleBrand: "Scania", vehicleModel: "R140 LK/LKS/ LKT", yearStart: 1977, yearEnd: 2025 },
  { id: `app-${PART_ID}-16`, vehicleBrand: "Scania", vehicleModel: "R142 E/EW/H/HS/HW", yearStart: 1981, yearEnd: 2025 },
  { id: `app-${PART_ID}-17`, vehicleBrand: "Scania", vehicleModel: "S112", yearStart: 1986, yearEnd: 2025 },
  { id: `app-${PART_ID}-18`, vehicleBrand: "Scania", vehicleModel: "T112", yearStart: 1986, yearEnd: 2025 },
  { id: `app-${PART_ID}-19`, vehicleBrand: "Scania", vehicleModel: "T114", yearStart: 1988, yearEnd: 2006 },
  { id: `app-${PART_ID}-20`, vehicleBrand: "Scania", vehicleModel: "T141", yearStart: 1977, yearEnd: 2025 },
  { id: `app-${PART_ID}-21`, vehicleBrand: "Scania", vehicleModel: "T142", yearStart: 1981, yearEnd: 2025 },
  { id: `app-${PART_ID}-22`, vehicleBrand: "Agrale", vehicleModel: "4000-4100", yearStart: 2000, yearEnd: 2025 },
  { id: `app-${PART_ID}-23`, vehicleBrand: "Agrale", vehicleModel: "4000-4230", yearStart: 1996, yearEnd: 2025 },
  { id: `app-${PART_ID}-24`, vehicleBrand: "Agrale", vehicleModel: "4000-4118.4", yearStart: 2004, yearEnd: 2025 },
  { id: `app-${PART_ID}-25`, vehicleBrand: "Agrale", vehicleModel: "4000-4230.4", yearStart: 2001, yearEnd: 2025 },
  { id: `app-${PART_ID}-26`, vehicleBrand: "Case", vehicleModel: "2470", yearStart: 1990, yearEnd: 2025 },
  { id: `app-${PART_ID}-27`, vehicleBrand: "Case", vehicleModel: "4490", yearStart: 1990, yearEnd: 2025 },
];

/**
 * Real catalog record imported from the UFI supplier quotation
 * (`docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx`, item 23.290.00) as a
 * single high-density sample. It validates the product-detail layout against
 * real data before the bulk import — every detail card is populated.
 *
 * NOTE: the source sheet also lists 10 competitor cross-references (Mann W920/7,
 * Hengst H10W02, Mahle OC18, Tecfil PSL171, Vox LB171, Fram PH16, Wega WO671,
 * Fleetguard LB171, Parker RL17, Donaldson P550318). The current `IPart` model
 * has no field for brand cross-references — `equivalentPartIds` links GALLO parts
 * only — so they are intentionally omitted here pending a model decision.
 */
export function buildUfiSamplePart(now: Date): IPart {
  const unitCost = 21.46; // "Preço c/ ICMS, Pis e Cofins" from the sheet
  const marginPercent = 0.45;
  const suppliers: IPartSupplier[] = [
    {
      id: `sup-${PART_ID}-0`,
      name: "UFI Filters",
      supplierCode: "23.290.00",
      invoiceNumber: "045128",
      invoiceDate: "2024-11-14T00:00:00.000Z",
      cost: unitCost,
      quantity: 24,
    },
  ];

  return {
    id: PART_ID,
    sku: "23.290.00",
    name: "Filtro Spin-On do Óleo",
    description:
      "Filtro spin-on do óleo lubrificante UFI. Aplicação em linha pesada Scania (séries 3 e 4) além de Agrale e Case. Origem importada.",
    oemCodes: ["Scania 173171"],
    equivalentPartIds: [],
    crossReferences: [
      { brand: "Mann", code: "W920/7" },
      { brand: "Hengst", code: "H10W02" },
      { brand: "Mahle", code: "OC18" },
      { brand: "Tecfil", code: "PSL171" },
      { brand: "Vox", code: "LB171" },
      { brand: "Fram", code: "PH16" },
      { brand: "Wega", code: "WO671" },
      { brand: "Fleetguard", code: "LB171" },
      { brand: "Parker", code: "RL17" },
      { brand: "Donaldson", code: "P550318" },
    ],
    applications: APPLICATIONS,
    brand: "UFI",
    supplier: "UFI Filters",
    category: "filtro",
    subcategory: "óleo",
    isOriginal: false,
    unitCost,
    unitPrice: Math.round(unitCost * (1 + marginPercent) * 100) / 100,
    marginPercent,
    gtin: "8003453042230",
    sefazStatus: "validated",
    sefazCheckedAt: "2025-03-01T00:00:00.000Z",
    supplierCode: "23.290.00",
    reference: "173171",
    group: "1-FILTRO",
    partType: "Filtro Spin-On",
    priceTables: buildPriceTables(unitCost, marginPercent),
    fiscal: {
      ncm: "8421.23.00",
      icmsPercent: 17,
      taxSubstitution: true, // CST 110 — origem estrangeira + ICMS por ST
      origin: "Importado",
    },
    weightKg: 0.494,
    storageLocation: "C-07",
    boxQuantity: 6,
    fractionable: true,
    unitOfMeasure: "PC",
    suppliers,
    averageCost: weightedAverageCost(suppliers) ?? unitCost,
    stockAvailable: 18,
    stockMinimum: 6,
    division: "parts",
    active: true,
    storeId: "store-matriz",
    createdAt: "2022-08-23T00:00:00.000Z",
    updatedAt: now.toISOString(),
  };
}
