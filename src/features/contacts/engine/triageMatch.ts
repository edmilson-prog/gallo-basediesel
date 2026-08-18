import { normalizePhoneKey } from "@/features/dintec-import/engine";

/**
 * Comparison primitives shared by the triage suggestion scorer and the
 * duplicate detector.
 *
 * Phone comparison deliberately reuses `normalizePhoneKey` (DDD + last 8
 * digits, 9th digit dropped) rather than growing a second Brazilian phone
 * normalizer here. That collapse is exactly what makes a 9th-digit variant
 * compare equal — the single most common way a duplicate contact enters this
 * base (see `scripts/waha-ninth-digit-reconcile.ts`).
 */

/** DDD + last 8 digits, or `null` when the value is not a BR phone shape. */
export function phoneKeyOf(phone: string | null | undefined): string | null {
  return normalizePhoneKey(phone);
}

/** Area code of a BR phone, or `null`. Weak evidence on its own. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  const key = normalizePhoneKey(phone);
  return key ? key.slice(0, 2) : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Free e-mail hosts. A shared domain here says nothing — half the base is on
 * gmail — so only a domain OUTSIDE this list is treated as company evidence.
 */
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "yahoo.com",
  "yahoo.com.br",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "live.com",
  "icloud.com",
  "me.com",
  "globo.com",
]);

/** Company domain of an e-mail, or `null` for free hosts and malformed values. */
export function companyEmailDomainOf(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1);
  if (!domain.includes(".")) return null;
  return GENERIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}

/**
 * Words that identify nobody.
 *
 * Almost every company in this base is "<Something> Transportes" or
 * "<Something> Diesel", so matching on those words alone would pair unrelated
 * customers with high confidence. Only the distinctive part of a name is
 * allowed to carry a match — legal suffixes, industry words and connectives
 * are dropped.
 */
const GENERIC_NAME_TOKENS = new Set([
  // legal / corporate
  "ltda",
  "eireli",
  "epp",
  "mei",
  "cia",
  "sociedade",
  "empresa",
  "grupo",
  "filial",
  "matriz",
  "comercio",
  "comercial",
  "industria",
  "industrial",
  "servicos",
  "servico",
  "representacoes",
  "representacao",
  "empreendimentos",
  "distribuidora",
  "distribuidor",
  "importacao",
  "exportacao",
  // industry
  "transportes",
  "transporte",
  "transportadora",
  "logistica",
  "auto",
  "autopecas",
  "pecas",
  "peca",
  "diesel",
  "mecanica",
  "oficina",
  "retifica",
  "agricola",
  "agropecuaria",
  "terraplanagem",
  "construcoes",
  "construtora",
  "frigorifico",
  "ceramica",
  "eletrica",
  "eletronica",
  "hidraulica",
  "injetora",
  "bomba",
  "caminhoes",
  "veiculos",
  "maquinas",
  "implementos",
  // connectives / roles that show up in WhatsApp display names
  "compras",
  "vendas",
  "financeiro",
  "contato",
  "setor",
  "sr",
  "sra",
  "dr",
]);

/** Removes accents and anything that is not a letter or digit. */
function deburr(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Distinctive words of a name, for matching.
 *
 * Contact names come from WhatsApp profiles, so they carry emoji, phone
 * numbers and parenthetical notes ("Jonas (bomba injetora)", "😀"). Anything
 * that is not a letter is stripped, short words are dropped, and the generic
 * vocabulary above is removed — what remains is the part that actually
 * identifies someone. Returns an empty array when nothing distinctive is left,
 * which is a valid answer: it means the name cannot support a match.
 */
export function nameTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const words = deburr(raw)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const word of words) {
    if (word.length < 3) continue;
    if (/\d/.test(word)) continue;
    if (GENERIC_NAME_TOKENS.has(word)) continue;
    if (!tokens.includes(word)) tokens.push(word);
  }
  return tokens;
}

/** Distinctive words present in both names. */
export function sharedNameTokens(a: string | null | undefined, b: string | null | undefined) {
  const left = nameTokens(a);
  if (left.length === 0) return [];
  const right = new Set(nameTokens(b));
  return left.filter((token) => right.has(token));
}
