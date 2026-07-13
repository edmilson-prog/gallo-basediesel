export { normalizePhoneKey } from "./phoneKey";
export { resolveCustomerType, type DintecCustomerType } from "./customerType";
export { fillIfEmpty } from "./fillIfEmpty";
export { normalizeVehicleBrandModel, type VehicleBrandModel } from "./vehicleNormalize";
export { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";
export { readZipEntry, listZipEntries } from "./xlsxZip";
export { colLettersToIndex, parseSharedStrings, parseSheetRows, loadXlsxSheet } from "./xlsxParser";
export { buildDintecPriceTables } from "./dintecPriceTables";
export { parseAplicacaoText } from "./aplicacaoParser";
export { titleCaseName } from "./titleCase";
export { extractCrossReferences } from "./crossReferenceExtractor";
export {
  buildCrossReferenceIndex,
  findBridgeSku,
  normalizeCrossReferenceCode,
  type CrossReferenceSource,
} from "./crossReferenceBridge";
