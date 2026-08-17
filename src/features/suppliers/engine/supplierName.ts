/**
 * Supplier names arrived as free text: `parts.supplier` carries 127 distinct
 * strings for 4.005 parts, 3.311 of which are the placeholder "Não informado".
 * Until `parts.supplier_id` exists, this module IS the join key — the same
 * normalization runs in the backfill migration, so the two must agree.
 */

/** Legal-form suffixes that split one supplier into two records. */
const COMPANY_SUFFIXES = ["ltda", "me", "epp", "eireli", "s a", "sa", "s\\/a"];

/**
 * Names the catalog spells two ways. Deliberately tiny: only pairs the data
 * itself evidences. Key is the normalized form, value is the display name.
 */
export const SUPPLIER_NAME_ALIASES: Record<string, string> = {
  ufi: "UFI Filters",
  "ufi filters": "UFI Filters",
};

/** Placeholders the DINTEC import writes when the field was blank. */
const PLACEHOLDERS = new Set(["nao informado", "sem fornecedor", "n a", "-"]);

/** Lowercased, unaccented, entity-decoded, suffix-free join key. */
export function normalizeSupplierName(raw: string): string {
  const decoded = (raw ?? "").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ");
  const unaccented = decoded.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cleaned = unaccented
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = new RegExp(`\\s+(${COMPANY_SUFFIXES.join("|")})$`);
  let out = cleaned;
  // A name can end in more than one suffix ("… Ltda ME").
  while (suffix.test(out)) out = out.replace(suffix, "");
  return out.trim();
}

/** Title-cases a word, leaving short connectors ("de", "e", "da") lowercase. */
const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"]);

function titleCaseWord(word: string, index: number): string {
  if (word === "&") return word;
  if (index > 0 && CONNECTORS.has(word.toLowerCase())) return word.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Display name for a raw catalog string, or `null` when the string carries no
 * supplier at all. All-caps input is title-cased; input that already has mixed
 * case is left alone (someone typed it on purpose).
 */
export function canonicalSupplierName(raw: string): string | null {
  const key = normalizeSupplierName(raw);
  if (!key || PLACEHOLDERS.has(key)) return null;

  const alias = SUPPLIER_NAME_ALIASES[key];
  if (alias) return alias;

  const decoded = (raw ?? "").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  const isAllCaps = decoded === decoded.toUpperCase();
  if (!isAllCaps) return decoded;

  return decoded.split(" ").map(titleCaseWord).join(" ");
}

/** True when two raw names denote the same supplier. */
export function supplierNameMatches(a: string, b: string): boolean {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return false;
  return (SUPPLIER_NAME_ALIASES[na] ?? na) === (SUPPLIER_NAME_ALIASES[nb] ?? nb);
}
