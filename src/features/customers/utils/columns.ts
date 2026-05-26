/**
 * Configurable columns for the customers list table.
 *
 * Mandatory columns (always visible): checkbox, name, type, abc, status.
 * Toggleable columns are persisted in `localStorage` under
 * `gallo-customers-columns` (PRD-015 RF-008).
 */

export const MANDATORY_COLUMNS = ["name", "type", "abc", "status"] as const;

export const OPTIONAL_COLUMNS = [
  "document",
  "seller",
  "ticketMedio",
  "recency",
  "ltv",
  "tags",
  "city",
  "lastConversation",
  "createdAt",
] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export type ColumnId = (typeof MANDATORY_COLUMNS)[number] | OptionalColumn;

export const COLUMN_LABELS: Record<ColumnId, string> = {
  name: "Cliente",
  type: "Tipo",
  abc: "ABC",
  status: "Status",
  document: "CNPJ/CPF",
  seller: "Vendedor",
  ticketMedio: "Ticket médio",
  recency: "Recência",
  ltv: "LTV",
  tags: "Tags",
  city: "Cidade",
  lastConversation: "Última conversa",
  createdAt: "Cadastro",
};

export const DEFAULT_VISIBLE_OPTIONAL: OptionalColumn[] = [
  "document",
  "seller",
  "ticketMedio",
  "recency",
  "tags",
];

export const COLUMNS_LOCALSTORAGE_KEY = "gallo-customers-columns";

export function readVisibleOptional(): OptionalColumn[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_OPTIONAL;
  try {
    const raw = window.localStorage.getItem(COLUMNS_LOCALSTORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_OPTIONAL;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_OPTIONAL;
    const valid = parsed.filter((id): id is OptionalColumn =>
      (OPTIONAL_COLUMNS as readonly string[]).includes(String(id)),
    );
    return valid;
  } catch {
    return DEFAULT_VISIBLE_OPTIONAL;
  }
}

export function writeVisibleOptional(ids: OptionalColumn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLUMNS_LOCALSTORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage indisponível — preferência apenas em memória nesta sessão.
  }
}
