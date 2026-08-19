/**
 * User-facing formatters for monetary values, fiscal documents and Brazilian
 * phone numbers. All output is `pt-BR`; never localize via the user's browser
 * settings — the platform is single-locale (Brazil) and consistency matters
 * more than per-user preferences.
 */

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_COMPACT_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Format a number as Brazilian Real (e.g. `1234.56` → `"R$ 1.234,56"`). */
export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return BRL_FORMATTER.format(value);
}

/** Compact BRL for cramped UI surfaces (e.g. `145000` → `"R$ 145 mil"`). */
export function formatBRLCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return BRL_COMPACT_FORMATTER.format(value);
}

/** Format a CPF (11 digits) as `XXX.XXX.XXX-XX`. Returns input unchanged when malformed. */
export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Format a CNPJ (14 digits) as `XX.XXX.XXX/XXXX-XX`. Returns input unchanged when malformed. */
export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Format a Brazilian phone number with DDD.
 * 13 digits w/ 55 prefix → `+55 (XX) XXXXX-XXXX` (E.164 mobile)
 * 12 digits w/ 55 prefix → `+55 (XX) XXXX-XXXX` (E.164 landline)
 * 11 digits → `(XX) XXXXX-XXXX` (mobile)
 * 10 digits → `(XX) XXXX-XXXX` (landline)
 * Anything else → input unchanged.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const d = digits.slice(2);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const d = digits.slice(2);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Format a percent share (0..1) as `"45,2%"`. */
export function formatPercent(share: number | null | undefined, fractionDigits = 1): string {
  if (share == null || Number.isNaN(share)) return "—";
  return `${(share * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/** Format an ISO date as Brazilian short date without the year (e.g. `"25/05"`). */
export function formatShortDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Format an ISO date as Brazilian short date (e.g. `"25/05/2026"`). */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format ISO date as Brazilian short date + time (e.g. `"25/05/2026 14:30"`). */
export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Human-friendly "time ago" string ("agora", "há 5 min", "há 3 dias", "há 2 meses").
 * `now` is injected for testability.
 */
export function formatRelativeTimeBR(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

/** Days between an ISO date and now (positive when the date is in the past). */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
