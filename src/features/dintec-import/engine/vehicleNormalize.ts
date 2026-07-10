export interface VehicleBrandModel {
  brand: string;
  model: string;
}

const PREFIX_RULES: Array<{ test: RegExp; brand: string }> = [
  { test: /^(FH|FM|VM)\b/, brand: "Volvo" },
  { test: /^[RPGS]\s?\d/, brand: "Scania" },
  { test: /^(ACTROS|ATEGO|AXOR|ACCELO|ATRON)\b/, brand: "Mercedes-Benz" },
  { test: /^(DAILY|STRALIS|TECTOR|HD)\b/, brand: "Iveco" },
  { test: /^CARGO\b/, brand: "Ford Cargo" },
  { test: /^(XF|CF|LF)\b/, brand: "DAF" },
  { test: /^(HILUX|COROLLA|SW4|ETIOS)\b/, brand: "Toyota" },
  { test: /^(AMAROK|GOL|SAVEIRO)\b/, brand: "Volkswagen" },
  { test: /^(DUCATO|STRADA|FIORINO|TORO|UNO)\b/, brand: "Fiat" },
  { test: /^(MASTER|KANGOO|DUSTER|OROCH)\b/, brand: "Renault" },
];

const VW_NUMERIC_KEYWORDS = /(CONSTELLATION|DELIVERY|WORKER)/;
const NUMERIC_PREFIX = /^\d{2}\.\d{3}\b/;

/**
 * VEICULOPROPRIETARIO.VEICULO is free text with no separate brand column
 * (e.g. "FH 540 6X4T", "R 440 A6X4", "24.280 CRM 6X2"). This infers a
 * brand by prefix against the platform's core heavy-truck line names plus
 * common light-vehicle lines seen in the DINTEC sample. Anything
 * unrecognized becomes brand "Outra" with the original text preserved as
 * the model — never dropped, always flagged for manual review.
 */
export function normalizeVehicleBrandModel(
  rawVeiculo: string | null | undefined,
): VehicleBrandModel {
  const text = (rawVeiculo ?? "").trim();
  if (!text) return { brand: "Outra", model: "Não informado" };
  const upper = text.toUpperCase();

  if (NUMERIC_PREFIX.test(upper)) {
    const brand = VW_NUMERIC_KEYWORDS.test(upper) ? "Volkswagen" : "Ford Cargo";
    return { brand, model: text };
  }

  for (const rule of PREFIX_RULES) {
    if (rule.test.test(upper)) return { brand: rule.brand, model: text };
  }
  return { brand: "Outra", model: text };
}
