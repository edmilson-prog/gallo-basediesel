export interface VehicleBrandModel {
  brand: string;
  model: string;
}

const PREFIX_RULES: Array<{ test: RegExp; brand: string }> = [
  { test: /^(FH|FM|VM)\b/, brand: "Volvo" },
  { test: /^[RPGS]\s?\d/, brand: "Scania" },
  { test: /^(ACTROS|ATEGO|AXOR|ACCELO)\b/, brand: "Mercedes-Benz" },
  // STRALISHD covers DINTEC exports that concatenate the STRALIS line name
  // directly with its HD trim code with no separating space (e.g.
  // "STRALISHD 19-320"); it must be listed before the bare STRALIS
  // alternative so the \b boundary check lands after "HD" instead of
  // failing between the S/H word-to-word join.
  { test: /^(DAILY|STRALISHD|STRALIS|TECTOR|HD)\b/, brand: "Iveco" },
  { test: /^CARGO\b/, brand: "Ford Cargo" },
  { test: /^(XF|CF|LF)\b/, brand: "DAF" },
  { test: /^TGX\b/, brand: "MAN" },
  { test: /^(HILUX|COROLLA|SW4|ETIOS)\b/, brand: "Toyota" },
  { test: /^(AMAROK|GOL|SAVEIRO|ATRON)\b/, brand: "Volkswagen" },
  { test: /^(DUCATO|STRADA|FIORINO|TORO|UNO)\b/, brand: "Fiat" },
  { test: /^(MASTER|KANGOO|DUSTER|OROCH)\b/, brand: "Renault" },
  { test: /^RANGER\b/, brand: "Ford" },
  { test: /^FRONTIER\b/, brand: "Nissan" },
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

  // SPRINTER doesn't always appear as a clean ^-anchored prefix in DINTEC's
  // concatenated export format (e.g. "415CDISPRINTERF" glues the engine
  // code, model name and body type together with no separators), so unlike
  // every other rule above it's matched anywhere in the string. Checked
  // only after the anchored PREFIX_RULES loop so it never shadows a rule
  // that legitimately matches at the start of the string.
  if (upper.includes("SPRINTER")) return { brand: "Mercedes-Benz", model: text };

  return { brand: "Outra", model: text };
}
