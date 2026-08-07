//
// Canonical vs. display are deliberately two different values. The canonical
// form is what goes to the clipboard, to the WhatsApp message and to the BR
// Code payload; the display form exists only to be read on screen. Copying a
// display value by accident is a money bug — see the spec, §4.1.

// `PixKeyType` is defined in `@/shared/types` (the domain model barrel) so the
// data layer (`IPixKey`) and this pure engine share one canonical definition.
export type { PixKeyType } from "@/shared/types";
import type { PixKeyType } from "@/shared/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Shared check-digit routine for CPF (9 base digits) and CNPJ (12 base digits). */
function hasValidCheckDigits(digits: string, weights: number[][]): boolean {
  const base = digits.slice(0, weights[0].length);
  let acc = base;
  for (const weight of weights) {
    const sum = weight.reduce((total, w, i) => total + Number(acc[i]) * w, 0);
    const rest = sum % 11;
    acc += String(rest < 2 ? 0 : 11 - rest);
  }
  return acc === digits;
}

const CPF_WEIGHTS = [
  [10, 9, 8, 7, 6, 5, 4, 3, 2],
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
];
const CNPJ_WEIGHTS = [
  [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
];

export function toCanonicalPixKey(type: PixKeyType, raw: string): string {
  const trimmed = raw.trim();
  switch (type) {
    case "cnpj":
    case "cpf":
      return digitsOnly(trimmed);
    case "phone": {
      const digits = digitsOnly(trimmed);
      return digits ? `+${digits}` : "";
    }
    case "email":
    case "random":
      return trimmed.toLowerCase();
  }
}

export function isValidPixKey(type: PixKeyType, canonical: string): boolean {
  switch (type) {
    case "cnpj":
      if (canonical.length !== 14 || /^(\d)\1{13}$/.test(canonical)) return false;
      return hasValidCheckDigits(canonical, CNPJ_WEIGHTS);
    case "cpf":
      if (canonical.length !== 11 || /^(\d)\1{10}$/.test(canonical)) return false;
      return hasValidCheckDigits(canonical, CPF_WEIGHTS);
    case "phone":
      // E.164: leading + and 12-14 digits (country + area + subscriber).
      return /^\+\d{12,14}$/.test(canonical);
    case "email":
      return EMAIL_RE.test(canonical) && canonical.length <= 77;
    case "random":
      return UUID_RE.test(canonical);
  }
}

export function toDisplayPixKey(type: PixKeyType, canonical: string): string {
  switch (type) {
    case "cnpj":
      if (canonical.length !== 14) return canonical;
      return canonical.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    case "cpf":
      if (canonical.length !== 11) return canonical;
      return canonical.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    case "phone": {
      const m = /^\+(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(canonical);
      return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : canonical;
    }
    case "email":
    case "random":
      return canonical;
  }
}
